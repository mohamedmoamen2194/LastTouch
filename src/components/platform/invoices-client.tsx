"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ManualInvoiceClient({
  tenants,
}: {
  tenants: Array<{ id: string; businessName: string }>;
}) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("paid");
  const [method, setMethod] = useState("cash");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!tenantId) return alert("Pick a tenant");
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
        Tenant
        <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="mp-select mt-1 min-w-[200px] rounded-lg border px-2 py-1.5 text-sm">
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.businessName}</option>
          ))}
        </select>
      </label>
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
        Create invoice
      </button>
    </div>
  );
}
