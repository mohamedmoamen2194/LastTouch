"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail } from "lucide-react";

/** Owner password form. Email is typed by the user and matched server-side against env. */
export function PlatformLoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Login failed");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl border border-black/15 bg-white px-3.5 py-2.5 ps-10 text-sm text-[#101828] outline-none focus:border-[#101828]";

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-xs font-semibold text-gray-500">
        Email
        <span className="relative mt-1 block">
          <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="username"
            dir="ltr"
            placeholder="admin@example.com"
            className={input}
          />
        </span>
      </label>
      <label className="text-xs font-semibold text-gray-500">
        Password
        <span className="relative mt-1 block">
          <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
<input
              value={password}
              suppressHydrationWarning
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="current-password"
              dir="ltr"
              tabIndex={0}
              placeholder="••••••••"
              className={input}
            />
        </span>
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email.trim() || !password}
        className="rounded-full bg-[#0b1526] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
