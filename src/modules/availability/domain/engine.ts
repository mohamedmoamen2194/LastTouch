import { db } from "@/db";
import { appointments, appointmentEmployees, appointmentServices, breaks as breaksTable, timeOff, workingHours, type AppointmentStatus } from "@/db/schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { format, parse } from "date-fns";

/**
 * Availability engine (spec section 16/18).
 *
 * Available slots are NEVER stored — they are generated on demand from:
 *   business hours -> employee working hours -> breaks -> time off ->
 *   existing appointments -> buffers -> service duration.
 */

export type TimeSlot = {
  start: string; // "09:00"
  end: string; // "09:45"
  available: boolean;
};

const SLOT_STEP = 30; // candidate start every 30 minutes

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

const APPOINTMENT_ACTIVE: AppointmentStatus[] = ["pending", "confirmed"];

function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function existingBookings(employeeId: string, date: Date) {
  const { start, end } = dayBounds(date);

  const activeWhere = and(
    gte(appointments.appointmentDate, start),
    lte(appointments.appointmentDate, end),
    inArray(appointments.status, APPOINTMENT_ACTIVE)
  );

  // Appointments where this worker is the PRIMARY staff member.
  const primaryRows = await db
    .select()
    .from(appointments)
    .where(and(activeWhere, eq(appointments.employeeId, employeeId)));

  // Appointments where this worker is assigned per-service (multi-worker
  // packages). For those we only block THEIR service's window, not the whole
  // appointment — worker 1 doing 1:00–1:45 and worker 2 doing 1:45–2:15 must
  // only have their own part greyed out.
  const assignedRows = await db
    .select({ appointmentId: appointmentEmployees.appointmentId })
    .from(appointmentEmployees)
    .where(eq(appointmentEmployees.employeeId, employeeId));

  const assignedIds = assignedRows.map((a) => a.appointmentId);

  const assignedAppts =
    assignedIds.length > 0
      ? await db
          .select()
          .from(appointments)
          .where(and(activeWhere, inArray(appointments.id, assignedIds)))
      : [];

  const apptIds = assignedAppts.map((a) => a.id);

  const [serviceRows, linkRows] = await Promise.all([
    apptIds.length > 0
      ? db
          .select({
            appointmentId: appointmentServices.appointmentId,
            serviceId: appointmentServices.serviceId,
            durationMinutes: appointmentServices.durationSnapshot,
            sortOrder: appointmentServices.sortOrder,
          })
          .from(appointmentServices)
          .where(inArray(appointmentServices.appointmentId, apptIds))
          .orderBy(appointmentServices.sortOrder)
      : Promise.resolve([]),
    apptIds.length > 0
      ? db
          .select({
            appointmentId: appointmentEmployees.appointmentId,
            serviceId: appointmentEmployees.serviceId,
          })
          .from(appointmentEmployees)
          .where(
            and(
              inArray(appointmentEmployees.appointmentId, apptIds),
              eq(appointmentEmployees.employeeId, employeeId)
            )
          )
      : Promise.resolve([]),
  ]);

  const servicesByAppt = new Map<string, typeof serviceRows>();
  for (const s of serviceRows) {
    const list = servicesByAppt.get(s.appointmentId) ?? [];
    list.push(s);
    servicesByAppt.set(s.appointmentId, list);
  }

  const myServiceIds = new Map<string, Set<string>>();
  for (const l of linkRows) {
    if (!l.serviceId) continue;
    const set = myServiceIds.get(l.appointmentId) ?? new Set<string>();
    set.add(l.serviceId);
    myServiceIds.set(l.appointmentId, set);
  }

  const busy: Array<{ start: number; end: number }> = [];

  // Appointments where we can resolve this worker's per-service window(s)
  // (multi-worker packages). For those, block ONLY their own segment — the
  // primary worker also appears in `appointmentEmployees`, so the per-service
  // windows take precedence over the full-appointment window.
  const segmentedIds = new Set<string>();
  const segments = new Map<string, Array<{ start: number; end: number }>>();

  for (const b of assignedAppts) {
    const mine = myServiceIds.get(b.id);
    if (mine && mine.size > 0) {
      const services = servicesByAppt.get(b.id) ?? [];
      let cursor = toMinutes(b.startTime);
      const segs: Array<{ start: number; end: number }> = [];
      for (const s of services) {
        const segEnd = cursor + s.durationMinutes;
        if (mine.has(s.serviceId ?? "")) {
          segs.push({ start: cursor, end: segEnd });
        }
        cursor = segEnd;
      }
      if (segs.length > 0) {
        segmentedIds.add(b.id);
        segments.set(b.id, segs);
      }
    }
  }

  for (const b of primaryRows) {
    // If this worker is segmented on that appointment, skip the full window.
    if (segmentedIds.has(b.id)) continue;
    busy.push({ start: toMinutes(b.startTime), end: toMinutes(b.endTime) });
  }

  for (const [, segs] of segments) {
    busy.push(...segs);
  }

  return busy;
}

/**
 * Builds the time slots available for one employee on one date.
 */
export async function buildDaySlots(args: {
  employeeId: string;
  date: Date;
  serviceDurationMinutes: number;
  bufferBefore?: number;
  bufferAfter?: number;
}): Promise<TimeSlot[]> {
  const weekday = args.date.getDay();
  const schedule = await db.query.workingHours.findMany({
    where: and(eq(workingHours.employeeId, args.employeeId), eq(workingHours.weekday, weekday)),
  });

  if (schedule.length === 0) return []; // not working that weekday

  // time off check
  const { start, end } = dayBounds(args.date);
  const leaves = await db.query.timeOff.findMany({
    where: and(
      eq(timeOff.employeeId, args.employeeId),
      lte(timeOff.startDate, end),
      gte(timeOff.endDate, start)
    ),
  });
  if (leaves.length > 0) return [];

  const bookings = await existingBookings(args.employeeId, args.date);
  const restBreaks = await db.query.breaks.findMany({
    where: and(eq(breaksTable.employeeId, args.employeeId), eq(breaksTable.weekday, weekday)),
  });
  const breakRanges = restBreaks.map((b) => ({
    start: toMinutes(b.startTime),
    end: toMinutes(b.endTime),
  }));

  const duration = args.serviceDurationMinutes + (args.bufferBefore ?? 0) + (args.bufferAfter ?? 0);
  const slots: TimeSlot[] = [];

  for (const shift of schedule) {
    const open = toMinutes(shift.startTime);
    const close = toMinutes(shift.endTime);

    for (let start = open; start + duration <= close; start += SLOT_STEP) {
      const end = start + duration;
      const overBreak = breakRanges.some((b) => start < b.end && end > b.start);
      const overBooked = bookings.some((b) => start < b.end && end > b.start);
      slots.push({ start: toHHMM(start), end: toHHMM(end), available: !overBreak && !overBooked });
    }
  }
  return slots;
}

/**
 * Aggregate available slots across employees ("any available").
 */
export async function getAvailableDaySlots(args: {
  employeeIds: string[];
  date: Date;
  serviceDurationMinutes: number;
  bufferBefore?: number;
  bufferAfter?: number;
}): Promise<TimeSlot[]> {
  const merged = new Map<string, TimeSlot>();
  for (const employeeId of args.employeeIds) {
    const slots = await buildDaySlots({
      employeeId,
      date: args.date,
      serviceDurationMinutes: args.serviceDurationMinutes,
      bufferBefore: args.bufferBefore,
      bufferAfter: args.bufferAfter,
    });
    for (const s of slots) {
      if (s.available) merged.set(s.start, s);
    }
  }
  return Array.from(merged.values()).sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

/** Build a 7xN month matrix for the booking calendar. */
export function buildMonthMatrix(month: Date) {
  const cells: Array<{ date: string; weekday: number; inMonth: boolean; day: number }> = [];
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  for (let i = 0; i < first.getDay(); i++) {
    cells.push({ date: "", weekday: i, inMonth: false, day: 0 });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    const dt = new Date(month.getFullYear(), month.getMonth(), d);
    cells.push({ date: format(dt, "yyyy-MM-dd"), weekday: dt.getDay(), inMonth: true, day: d });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: "", weekday: cells.length % 7, inMonth: false, day: 0 });
  }
  return cells;
}

/**
 * Days of a month on which the given employees are scheduled to work.
 * With `requireAll` (default false), a day counts when at least one worker
 * is scheduled; with `true`, every worker must be scheduled that weekday
 * and none may be on time-off (used for multi-worker package bookings).
 * Cheap: queries schedules once and never touches live bookings — the grid
 * only greys out days the worker isn't working; exact slots come on demand.
 */
export async function listWorkingDays(args: {
  employeeIds: string[];
  year: number;
  month: number; // 0-based
  requireAll?: boolean;
}): Promise<string[]> {
  const monthStart = new Date(args.year, args.month, 1);
  const monthEnd = new Date(args.year, args.month + 1, 0);
  const start = dayBounds(monthStart).start;
  const endDt = dayBounds(monthEnd).end;

  if (args.employeeIds.length === 0) return [];

  const [schedules, leaves] = await Promise.all([
    db.query.workingHours.findMany({
      where: inArray(workingHours.employeeId, args.employeeIds),
    }),
    db.query.timeOff.findMany({
      where: and(
        inArray(timeOff.employeeId, args.employeeIds),
        lte(timeOff.startDate, endDt),
        gte(timeOff.endDate, start)
      ),
    }),
  ]);

  const workWeekdays = new Map<string, Set<number>>();
  for (const s of schedules) {
    if (!workWeekdays.has(s.employeeId)) workWeekdays.set(s.employeeId, new Set());
    workWeekdays.get(s.employeeId)!.add(s.weekday);
  }

  const offDays = new Set<string>();
  for (const leave of leaves) {
    const cursor = new Date(leave.startDate);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= leave.endDate.getTime() && cursor.getTime() <= endDt.getTime()) {
      offDays.add(format(cursor, "yyyy-MM-dd"));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const out: string[] = [];
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const dt = new Date(args.year, args.month, d);
    const ymd = format(dt, "yyyy-MM-dd");
    if (offDays.has(ymd)) continue;
    const weekday = dt.getDay();
    if (args.requireAll) {
      const everyone = args.employeeIds.every((id) => workWeekdays.get(id)?.has(weekday));
      if (everyone) out.push(ymd);
    } else {
      const working = args.employeeIds.some((id) => workWeekdays.get(id)?.has(weekday));
      if (working) out.push(ymd);
    }
  }
  return out;
}

export function parseDay(value: string): Date {
  return parse(value, "yyyy-MM-dd", new Date());
}

/**
 * Adds minutes to an "HH:MM" time, rolling over midnights.
 */
export function addMinutesToHHMM(start: string, minutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = ((h ?? 0) * 60 + (m ?? 0) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type WorkerDayModel = {
  working: boolean;
  windows: Array<{ open: number; close: number }>;
  busy: Array<{ start: number; end: number }>;
};

/**
 * Loads everything that constrains one worker on one date: shift windows,
 * rest breaks and existing bookings (both as minute ranges). Returns
 * `working: false` when the worker is off that day or on time-off.
 */
async function workerDayModel(employeeId: string, date: Date): Promise<WorkerDayModel> {
  const weekday = date.getDay();
  const schedule = await db.query.workingHours.findMany({
    where: and(eq(workingHours.employeeId, employeeId), eq(workingHours.weekday, weekday)),
  });

  if (schedule.length === 0) return { working: false, windows: [], busy: [] };

  const { start, end } = dayBounds(date);
  const leaves = await db.query.timeOff.findMany({
    where: and(
      eq(timeOff.employeeId, employeeId),
      lte(timeOff.startDate, end),
      gte(timeOff.endDate, start)
    ),
  });
  if (leaves.length > 0) return { working: false, windows: [], busy: [] };

  const bookings = await existingBookings(employeeId, date);
  const restBreaks = await db.query.breaks.findMany({
    where: and(eq(breaksTable.employeeId, employeeId), eq(breaksTable.weekday, weekday)),
  });

  return {
    working: true,
    windows: schedule.map((s) => ({ open: toMinutes(s.startTime), close: toMinutes(s.endTime) })),
    busy: [
      ...bookings,
      ...restBreaks.map((b) => ({ start: toMinutes(b.startTime), end: toMinutes(b.endTime) })),
    ],
  };
}

/**
 * Builds start times for a multi-worker, back-to-back appointment.
 *
 * Services run sequentially in the given order: worker 0 starts service 0 at
 * time T, worker 1 starts service 1 at T + d0, and so on. A start time T is
 * bookable when EVERY worker's own window (shift, minus breaks and existing
 * bookings) can host their service at its offset — unlike `buildDaySlots`,
 * this does NOT require every worker to be free for the whole appointment.
 *
 * Returns the full 30-minute grid so the UI can grey out unavailable starts.
 */
export async function buildSequentialChainSlots(args: {
  assignments: Array<{ employeeId: string; serviceDurationMinutes: number }>;
  date: Date;
}): Promise<TimeSlot[]> {
  if (args.assignments.length === 0) return [];

  const models = await Promise.all(args.assignments.map((a) => workerDayModel(a.employeeId, args.date)));

  const prefixes: number[] = [];
  let running = 0;
  for (const a of args.assignments) {
    prefixes.push(running);
    running += a.serviceDurationMinutes;
  }
  const total = running;
  if (total <= 0) return [];

  const slots: TimeSlot[] = [];
  // A start time T begins with worker 0 doing service 0, so T must fall inside
  // worker 0's shift windows. The per-worker check below verifies each worker
  // can host their own service at its offset (their window + busy ranges).
  for (const w of models[0].windows) {
    for (let T = w.open; T < w.close; T += SLOT_STEP) {
      let available = true;
      for (let i = 0; i < args.assignments.length; i++) {
        const model = models[i];
        const s = T + prefixes[i];
        const e = s + args.assignments[i].serviceDurationMinutes;
        if (!model.working) {
          available = false;
          break;
        }
        const inShift = model.windows.some((w) => s >= w.open && e <= w.close);
        const overBusy = model.busy.some((b) => s < b.end && e > b.start);
        if (!inShift || overBusy) {
          available = false;
          break;
        }
      }
      slots.push({ start: toHHMM(T), end: toHHMM(T + total), available });
    }
  }
  return slots;
}