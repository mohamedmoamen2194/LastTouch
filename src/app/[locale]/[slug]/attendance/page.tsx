import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getDashboardAccess } from "@/lib/tenant/dashboard";
import { getThemeTokens } from "@/config/business-types";
import { Permission } from "@/lib/permissions";
import { dateKeyOf } from "@/modules/attendance/domain/time";
import {
  getWorkerHistory,
  getWorkerState,
  listAttendanceDisputes,
  listAttendanceRequests,
  listWorkerDisputes,
  listWorkerRequests,
  listWorkersAttendance,
} from "@/modules/attendance/application/attendance";
import { AttendanceManager, type AdminDispute, type AdminRequest, type AdminWorkerRow } from "@/components/dashboard/attendance-manager";
import { WorkerAttendancePanel, type DayView, type DisputeView, type RequestView } from "@/components/attendance/worker-attendance-panel";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const ctx = await getDashboardAccess(slug).catch(() => notFound());

  const theme = getThemeTokens(ctx.theme);
  const todayKey = dateKeyOf(new Date(), ctx.timezone);

  const canManage = ctx.permissions.has(Permission["attendance.manage"]);
  const canView = ctx.permissions.has(Permission["attendance.read"]) || ctx.permissions.has(Permission["attendance.use"]);
  if (!canManage && !canView) notFound();

  if (canManage) {
    const requested = (await searchParams).date;
    const dateKey = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayKey;
    const [{ policy, rows }, requests, disputes] = await Promise.all([
      listWorkersAttendance(ctx, dateKey),
      listAttendanceRequests(ctx),
      listAttendanceDisputes(ctx),
    ]);

    const mappedRows: AdminWorkerRow[] = rows.map((row) => ({
      employee: row.employee,
      day: (row.day as DayView) ?? null,
    }));
    const mappedRequests: AdminRequest[] = requests.map((row) => ({
      id: row.id,
      type: row.type,
      dateKey: row.dateKey,
      lateTime: row.lateTime,
      reason: row.reason,
      status: row.status,
      penaltyAmount: row.penaltyAmount,
      ownerNote: row.ownerNote,
      employeeName: row.employeeName,
    }));
    const mappedDisputes: AdminDispute[] = disputes.map((row) => ({
      id: row.id,
      dateKey: row.dateKey,
      note: row.note,
      status: row.status,
      ownerNote: row.ownerNote,
      employeeName: row.employeeName,
    }));

    return (
      <AttendanceManager
        slug={slug}
        locale={locale}
        timezone={ctx.timezone}
        currency={ctx.currency}
        theme={theme}
        dateKey={dateKey}
        todayKey={todayKey}
        rows={mappedRows}
        policy={policy}
        requests={mappedRequests}
        disputes={mappedDisputes}
      />
    );
  }

  let state: Awaited<ReturnType<typeof getWorkerState>> | null = null;
  try {
    state = await getWorkerState(ctx);
  } catch {
    state = null;
  }

  let history: Awaited<ReturnType<typeof getWorkerHistory>> | null = null;
  try {
    history = await getWorkerHistory(ctx, 30);
  } catch {
    history = null;
  }

  const linked = Boolean(state) || Boolean(history);
  if (!linked) {
    return (
      <WorkerAttendancePanel
        slug={slug}
        locale={locale}
        timezone={ctx.timezone}
        currency={ctx.currency}
        theme={theme}
        linked={false}
        employeeName=""
        employeeRole={null}
        clockedIn={false}
        lastLogAt={null}
        locationName={null}
        today={null}
        canPunch={false}
        todayKey={todayKey}
        history={[]}
        requests={[]}
        disputes={[]}
        earlyCheckInMinutes={30}
      />
    );
  }

  let requests: Awaited<ReturnType<typeof listWorkerRequests>> = [];
  try {
    requests = await listWorkerRequests(ctx);
  } catch {
    requests = [];
  }
  let disputes: Awaited<ReturnType<typeof listWorkerDisputes>> = [];
  try {
    disputes = await listWorkerDisputes(ctx);
  } catch {
    disputes = [];
  }

  const employeeName = state
    ? state.employee.displayName ?? `${state.employee.firstName}${state.employee.lastName ? " " + state.employee.lastName : ""}`
    : history
      ? history.employee.displayName ?? `${history.employee.firstName}${history.employee.lastName ? " " + history.employee.lastName : ""}`
      : "";

  const mappedHistory: DayView[] = (history?.days ?? []) as DayView[];
  const mappedRequests: RequestView[] = requests.map((row) => ({
    id: row.id,
    type: row.type,
    dateKey: row.dateKey,
    lateTime: row.lateTime,
    reason: row.reason,
    status: row.status,
    penaltyAmount: row.penaltyAmount,
    ownerNote: row.ownerNote,
  }));
  const mappedDisputes: DisputeView[] = disputes.map((row) => ({
    id: row.id,
    dateKey: row.dateKey,
    note: row.note,
    status: row.status,
    ownerNote: row.ownerNote,
  }));

  return (
    <WorkerAttendancePanel
      slug={slug}
      locale={locale}
      timezone={ctx.timezone}
      currency={ctx.currency}
      theme={theme}
      linked
      employeeName={employeeName}
      employeeRole={state?.employee.role ?? null}
      clockedIn={state?.clockedIn ?? false}
      lastLogAt={state?.lastLog ? state.lastLog.createdAt.toISOString() : null}
      locationName={state?.location?.name ?? null}
      today={(state?.day as DayView) ?? null}
      canPunch={ctx.permissions.has(Permission["attendance.use"])}
      todayKey={state?.todayKey ?? todayKey}
      history={mappedHistory}
      requests={mappedRequests}
      disputes={mappedDisputes}
      earlyCheckInMinutes={state?.policy.earlyCheckInMinutes ?? 30}
    />
  );
}
