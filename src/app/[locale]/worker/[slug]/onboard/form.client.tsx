"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WorkerOnboardForm({
  locale,
  slug,
  code,
  tenantName,
  employeeName,
  employeeRole,
}: {
  locale: string;
  slug: string;
  code: string;
  tenantName: string;
  employeeName: string;
  employeeRole: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLabel =
    employeeRole === "cashier" ? "Cashier" : employeeRole === "manager" ? "Manager" : "Worker";

  const firstNameDefault = employeeName.split(" ")[0] || employeeName;
  const lastNameDefault = employeeName.split(" ").slice(1).join(" ") || "";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const payload = {
      code,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
    };

    try {
      const res = await fetch("/api/worker/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Could not create account");

      const signInUrl = `/${locale}/auth/sign-in?redirect_url=${encodeURIComponent(
        `/${locale}/${slug}/attendance`
      )}&email_hint=${encodeURIComponent(payload.email)}`;
      router.replace(signInUrl);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-[#c5c6cd]/60 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-center gap-2 text-[#091426] mb-6">
        <span className="h-5 w-5" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#091426" strokeWidth="2" className="h-5 w-5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </span>
        <h1 className="text-xl font-bold">Join {tenantName}</h1>
      </div>

      <p className="mt-1 text-sm text-[#45474c]">
        Create your worker account for {tenantName}.
      </p>
      <p className="mt-0.5 text-xs text-[#45474c]">
        Role: <span className="font-medium">{roleLabel}</span>
      </p>

      {error && (
        <p className="mt-3 rounded-xl bg-[#ffdad6] px-4 py-2.5 text-sm text-[#93000a]">{error}</p>
      )}

      <form onSubmit={submit} className="mt-5 space-y-3">
        <input type="hidden" name="code" value={code} />

        <div>
          <label className="mb-1 block text-xs font-medium text-[#45474c]">
            First name
          </label>
          <input
            name="firstName"
            defaultValue={firstNameDefault}
            required
            className="w-full rounded-xl border border-[#c5c6cd] px-4 py-3 text-base text-[#091426] outline-none focus:border-[#091426]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[#45474c]">
            Last name
          </label>
          <input
            name="lastName"
            defaultValue={lastNameDefault}
            className="w-full rounded-xl border border-[#c5c6cd] px-4 py-3 text-base text-[#091426] outline-none focus:border-[#091426]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[#45474c]">
            Email address
          </label>
          <input
            name="email"
            type="email"
            required
            autoCapitalize="none"
            className="w-full rounded-xl border border-[#c5c6cd] px-4 py-3 text-base text-[#091426] outline-none focus:border-[#091426]"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[#45474c]">
            Password
          </label>
          <input
            name="password"
            type="password"
            minLength={8}
            required
            className="w-full rounded-xl border border-[#c5c6cd] px-4 py-3 text-base text-[#091426] outline-none focus:border-[#091426]"
          />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[#091426] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Creating account…" : "Create account & join"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-[#45474c]">
        This link can be used once and expires in 7 days.
      </p>
    </div>
  );
}
