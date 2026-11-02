import { setRequestLocale } from "next-intl/server";
import { getOptionalUserId } from "@/lib/auth/session";
import { getStaffInvitePreview } from "@/modules/staff/application/invites";
import { JoinInvite } from "@/components/staff/join-invite";
import { Logo } from "@/components/booking/logo";

export const dynamic = "force-dynamic";

export default async function StaffJoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { locale } = await params;
  const { code } = await searchParams;
  setRequestLocale(locale);

  const rawCode = Array.isArray(code) ? code[0] : code;
  const invite = rawCode ? await getStaffInvitePreview(rawCode) : null;
  const userId = await getOptionalUserId();

  const preview =
    invite && (invite.state === "valid" || invite.state === "used" || invite.state === "expired")
      ? {
          state: invite.state,
          tenantName: invite.tenantName,
          tenantSlug: invite.tenantSlug,
          employeeName:
            invite.employeeDisplayName ??
            `${invite.employeeFirstName}${invite.employeeLastName ? " " + invite.employeeLastName : ""}`,
          employeeRole: invite.employeeRole,
          accessRole: invite.accessRole,
        }
      : null;

  return (
    <main className="mp-bg flex min-h-screen min-h-dvh flex-col items-center justify-center px-4 py-10">
      <Logo className="h-7 w-auto" />
      <div className="mt-6 w-full max-w-md">
        <JoinInvite
          locale={locale}
          initialCode={rawCode ?? ""}
          signedIn={Boolean(userId)}
          preview={preview}
          invalidCode={Boolean(rawCode) && !preview}
        />
      </div>
      <p className="mt-4 text-center text-xs text-[#45474c]">
        Secure team access · Powered by LastTouch
      </p>
    </main>
  );
}
