"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock3, KeyRound, ShieldX } from "lucide-react";

type Props = {
  locale: string;
  initialCode: string;
  signedIn: boolean;
  preview:
    | {
        state: "valid" | "used" | "expired";
        tenantName: string;
        tenantSlug: string;
        employeeName: string;
        employeeRole: string | null;
        accessRole: string;
      }
    | null;
  invalidCode: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  manager: "Manager",
  cashier: "Cashier",
  employee: "Worker",
};

function homePath(locale: string, slug: string, role: string) {
  if (role === "cashier") return `/${locale}/desk/${slug}`;
  if (role === "employee") return `/${locale}/${slug}/attendance`;
  return `/${locale}/${slug}/dashboard`;
}

export function JoinInvite({ locale, initialCode, signedIn, preview, invalidCode }: Props) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitCode = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    router.push(`/${locale}/staff/join?code=${encodeURIComponent(clean)}`);
  };

  const claim = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: initialCode }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Could not accept invite");
      router.replace(homePath(locale, json.data.tenantSlug, json.data.role));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept invite");
      setBusy(false);
    }
  };

  const redirectUrl = `/${locale}/staff/join?code=${encodeURIComponent(initialCode)}`;

  return (
    <div className="w-full max-w-md rounded-3xl border border-[#c5c6cd]/60 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-center gap-2 text-[#091426]">
        <KeyRound className="h-5 w-5" />
        <h1 className="text-xl font-bold">Staff invite</h1>
      </div>

      {invalidCode || !initialCode ? (
        <>
          <p className="mt-2 text-sm text-[#45474c]">
            Enter the invite code your manager shared with you.
          </p>
          <form onSubmit={submitCode} className="mt-4 space-y-3">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="ST-XXXX-XXXX"
              dir="ltr"
              autoCapitalize="characters"
              className="w-full rounded-xl border border-[#c5c6cd] px-4 py-3 text-center text-base font-semibold tracking-widest text-[#091426] outline-none focus:border-[#091426]"
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="w-full rounded-full bg-[#091426] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              Continue
            </button>
          </form>
        </>
      ) : preview?.state === "valid" ? (
        <>
          <p className="mt-2 text-sm text-[#45474c]">
            You have been invited to join
          </p>
          <p className="mt-1 text-lg font-semibold text-[#091426]">{preview.tenantName}</p>
          <div className="mt-3 rounded-2xl border border-[#c5c6cd]/60 bg-[#f7f7f5] px-4 py-3">
            <p className="text-sm font-medium text-[#091426]">{preview.employeeName}</p>
            <p className="text-xs text-[#45474c]">
              {preview.employeeRole ?? ROLE_LABELS[preview.accessRole] ?? "Team member"}
              {" · "}
              {ROLE_LABELS[preview.accessRole] ?? preview.accessRole} panel
            </p>
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-[#ffdad6] px-4 py-2.5 text-sm text-[#93000a]">{error}</p>
          )}

          {signedIn ? (
            <button
              type="button"
              onClick={claim}
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#091426] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              {busy ? "Joining…" : "Accept invite"}
            </button>
          ) : (
            <div className="mt-4 space-y-2">
              <Link
                href={`/${locale}/auth/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`}
                className="block w-full rounded-full bg-[#091426] px-5 py-3 text-center text-sm font-semibold text-white"
              >
                Create an account to join
              </Link>
              <Link
                href={`/${locale}/auth/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`}
                className="block w-full rounded-full border border-[#c5c6cd] px-5 py-3 text-center text-sm font-semibold text-[#091426]"
              >
                I already have an account
              </Link>
            </div>
          )}
          <p className="mt-3 text-center text-xs text-[#45474c]">
            This link can be used once and expires in 7 days.
          </p>
        </>
      ) : preview?.state === "expired" ? (
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-[#fff4e5] px-4 py-3 text-sm text-[#7a4100]">
          <Clock3 className="mt-0.5 h-5 w-5 shrink-0" />
          <p>This invite has expired. Ask your manager for a new link.</p>
        </div>
      ) : preview?.state === "used" ? (
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-[#eef1f5] px-4 py-3 text-sm text-[#45474c]">
          <ShieldX className="mt-0.5 h-5 w-5 shrink-0" />
          <p>This invite has already been used. Sign in to open your workspace.</p>
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-[#ffdad6] px-4 py-3 text-sm text-[#93000a]">
          <ShieldX className="mt-0.5 h-5 w-5 shrink-0" />
          <p>We could not find this invite. Check the link and try again.</p>
        </div>
      )}

      {preview?.state === "used" && (
        <Link
          href={`/${locale}/auth/sign-in?redirect_url=${encodeURIComponent(homePath(locale, preview.tenantSlug, preview.accessRole))}`}
          className="mt-4 block w-full rounded-full bg-[#091426] px-5 py-3 text-center text-sm font-semibold text-white"
        >
          Sign in
        </Link>
      )}
    </div>
  );
}
