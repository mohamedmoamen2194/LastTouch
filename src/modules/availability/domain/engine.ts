import { db } from "@/db";
import { appointments, breaks as breaksTable, timeOff, workingHours, type AppointmentStatus } from "@/db/schema";
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

async function existingBookings(employeeId: string, date: Date) {
  const { start, end } = dayBounds(date);
  const rows = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.employeeId, employeeId),
        gte(appointments.appointmentDate, start),
        lte(appointments.appointmentDate, end),
        inArray(appointments.status, APPOINTMENT_ACTIVE)
      )
    );
  return rows.map((b) => ({ start: toMinutes(b.startTime), end: toMinutes(b.endTime) }));
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
 * Days of a month on which at least one of the given employees is scheduled
 * to work (a weekday in their `workingHours` and not on time-off).
 * Cheap: queries schedules once and never touches live bookings — the grid
 * only greys out days the worker isn't working; exact slots come on demand.
 */
export async function listWorkingDays(args: {
  employeeIds: string[];
  year: number;
  month: number; // 0-based
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
    const working = args.employeeIds.some((id) => workWeekdays.get(id)?.has(weekday));
    if (working) out.push(ymd);
  }
  return out;
}

export function parseDay(value: string): Date {
  return parse(value, "yyyy-MM-dd", new Date());
}