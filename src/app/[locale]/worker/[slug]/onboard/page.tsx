import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { getStaffInvitePreview } from "@/modules/staff/application/invites";
import { WorkerOnboardForm } from "./form.client";

export const dynamic = "force-dynamic";

export default async function WorkerOnboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { locale, slug } = await params;
  const { code } = await searchParams;
  setRequestLocale(locale);

  const rawCode = Array.isArray(code) ? code[0] : code;
  if (!rawCode) notFound();

  const invite = await getStaffInvitePreview(rawCode);
  if (!invite || invite.state !== "valid") notFound();

  if (invite.tenantSlug !== slug) notFound();

  const employeeName =
    invite.employeeDisplayName ??
    `${invite.employeeFirstName}${invite.employeeLastName ? " " + invite.employeeLastName : ""}`;

  return (
    <main className="mp-bg flex min-h-screen min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <WorkerOnboardForm
          locale={locale}
          slug={slug}
          code={rawCode}
          tenantName={invite.tenantName}
          employeeName={employeeName}
          employeeRole={invite.accessRole}
        />
      </div>
    </main>
  );
}
