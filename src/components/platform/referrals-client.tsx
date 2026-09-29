"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, X } from "lucide-react";

export type PayoutRow = {
  id: string;
  businessName: string;
  amount: number;
  createdAt: string;
  user: { name: string; phone: string | null; email: string | null };
};

/** Click a name → popup with user info, WhatsApp chat, mark-paid action. */
export function ReferralPayoutPopup({ row }: { row: PayoutRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const digits = (row.user.phone ?? "").replace(/[^0-9]/g, "");
  // Local Egyptian format (01…) → international for wa.me.
  const waNumber = digits.length === 11 && digits.startsWith("0") ? `2${digits}` : digits;
  const waHref = waNumber ? `https://wa.me/${waNumber}` : null;

  const markPaid = async () => {
    if (!confirm(`Mark ${row.amount} EGP to ${row.user.name} as paid?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/platform/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "paid", referralId: row.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      setOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-semibold text-blue-700 hover:underline"
      >
        {row.user.name}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-[#101828]">{row.user.name}</h3>
                <p className="text-xs text-gray-500">
                  Referred {row.businessName} · {row.amount} EGP ·{" "}
                  {new Date(row.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <dl className="mt-4 space-y-2 rounded-xl border border-black/10 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Phone</dt>
                <dd className="font-semibold tabular-nums" dir="ltr">{row.user.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Email</dt>
                <dd className="max-w-[60%] truncate font-semibold" dir="ltr">{row.user.email ?? "—"}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-col gap-2">
              {waHref ? (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25d366] px-5 py-2.5 text-sm font-semibold text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp chat
                </a>
              ) : (
                <p className="rounded-xl bg-gray-100 px-4 py-2.5 text-center text-xs text-gray-500">
                  No phone number — WhatsApp unavailable
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={markPaid}
                className="w-full rounded-full bg-[#0b1526] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Mark as paid
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
