"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SubscriptionEditor({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: {
    plan: string;
    billingPeriod: string;
    status: string;
    customMonthlyPrice: string | number | null;
    notes: string | null;
    renewalDate: string | null;
    expirationDate: string | null;
  };
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(initial.plan);
  const [period, setPeriod] = useState(initial.billingPeriod ?? "monthly");
  const [status, setStatus] = useState(initial.status ?? "active");
  const [price, setPrice] = useState(initial.customMonthlyPrice?.toString() ?? "");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState(
    initial.expirationDate ? new Date(initial.expirationDate).toISOString().slice(0, 16) : "",
  );
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [withInvoice, setWithInvoice] = useState(true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/platform/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          plan,
          billingPeriod: period,
          status,
          customMonthlyPrice: plan === "enterprise" && price ? Number(price) : null,
          startDate: start ? new Date(start).toISOString() : null,
          endDate: end ? new Date(end).toISOString() : null,
          notes: notes || null,
          createInvoice: withInvoice,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      alert(withInvoice ? "Saved + invoice created." : "Saved.");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const action = async (a: "extend" | "cancel" | "reactivate" | "expire" | "renew" | "toggle_renew") => {
    if (!confirm(`Run action "${a}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/platform/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, action, months: 1, billingPeriod: period }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <label className="text-xs">
          Plan
          <select value={plan} onChange={(e) => setPlan(e.target.value)} className="mp-select mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
            <option value="free">Free</option>
            <option value="pro">Basic (= pro, 800)</option>
            <option value="ai">AI Growth (= ai, 1200)</option>
            <option value="enterprise">Enterprise (custom)</option>
          </select>
        </label>
        <label className="text-xs">
          Billing period
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="mp-select mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
            <option value="monthly">Monthly</option>
            <option value="semiannual">Semiannual −20%</option>
            <option value="annual">Annual −40%</option>
          </select>
        </label>
        <label className="text-xs">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="mp-select mt-1 w-full rounded-lg border px-2 py-1.5 text-sm">
            <option value="active">active</option>
            <option value="trial">trial</option>
            <option value="grace">grace</option>
            <option value="expired">expired</option>
            <option value="cancelled">cancelled</option>
          </select>
        </label>
        {plan === "enterprise" && (
          <label className="text-xs">
            Enterprise monthly price (EGP)
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={0} placeholder="e.g. 2500" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
          </label>
        )}
        <label className="text-xs">
          Start (optional)
          <input value={start} onChange={(e) => setStart(e.target.value)} type="datetime-local" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs">
          End (optional)
          <input value={end} onChange={(e) => setEnd(e.target.value)} type="datetime-local" className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" />
        </label>
      </div>
      <label className="text-xs">
        Notes (what did you add for this enterprise shop?)
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border px-2 py-1.5 text-sm" placeholder="Custom features, seats, deal terms…" />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={withInvoice} onChange={(e) => setWithInvoice(e.target.checked)} />
        Create invoice for this cycle (adds to revenue automatically)
      </label>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={save} className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          Save subscription
        </button>
        {(["extend", "renew", "cancel", "reactivate", "expire", "toggle_renew"] as const).map((a) => (
          <button key={a} disabled={busy} onClick={() => action(a)} className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}

export function InvoiceCreator({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("paid");
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!amount || Number(amount) <= 0) return alert("Enter an amount");
    setBusy(true);
    try {
      const res = await fetch("/api/platform/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, amount: Number(amount), status, paymentMethod: method, plan: "manual" }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      setAmount("");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">
        Amount (EGP)
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min={0} className="mt-1 w-32 rounded-lg border px-2 py-1.5 text-sm" />
      </label>
      <label className="text-xs">
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="mp-select mt-1 rounded-lg border px-2 py-1.5 text-sm">
          <option value="paid">paid</option>
          <option value="pending">pending</option>
          <option value="partial">partial</option>
          <option value="failed">failed</option>
        </select>
      </label>
      <label className="text-xs">
        Method
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="mp-select mt-1 rounded-lg border px-2 py-1.5 text-sm">
          <option value="cash">cash</option>
          <option value="card">card</option>
          <option value="wallet">wallet</option>
          <option value="online">online</option>
          <option value="instapay">instapay</option>
          <option value="manual">manual</option>
        </select>
      </label>
      <button disabled={busy} onClick={create} className="rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
        Add invoice
      </button>
    </div>
  );
}

export function InvoiceRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const set = async (next: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/platform/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!confirm("Delete this invoice?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/platform/invoices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-1.5">
      {status !== "paid" && (
        <button disabled={busy} onClick={() => set("paid")} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
          Mark paid
        </button>
      )}
      {status !== "pending" && (
        <button disabled={busy} onClick={() => set("pending")} className="rounded-full border border-gray-300 px-3 py-1 text-xs disabled:opacity-50">
          Pending
        </button>
      )}
      <button disabled={busy} onClick={del} className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 disabled:opacity-50">
        Delete
      </button>
    </div>
  );
}
