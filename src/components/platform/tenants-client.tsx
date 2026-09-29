"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TenantActions({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
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

  const remove = async (hard: boolean) => {
    const msg = hard ? "Permanently DELETE this tenant and ALL its data? This cannot be undone." : "Deactivate this tenant?";
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, hard }),
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
    <div className="flex flex-wrap gap-1.5">
      <button
        disabled={busy}
        onClick={() => patch({ active: !active })}
        className="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        {active ? "Deactivate" : "Activate"}
      </button>
      <button
        disabled={busy}
        onClick={() => remove(false)}
        className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold disabled:opacity-50"
      >
        Soft-delete
      </button>
      <button
        disabled={busy}
        onClick={() => remove(true)}
        className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-50"
      >
        Hard delete
      </button>
    </div>
  );
}

export function TenantInlineEdit({ id, current }: { id: string; current: { businessName: string; phone: string | null; email: string | null } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current.businessName);
  const [phone, setPhone] = useState(current.phone ?? "");
  const [email, setEmail] = useState(current.email ?? "");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold">
        Edit
      </button>
    );
  }

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/platform/tenants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, businessName: name, phone: phone || null, email: email || null }),
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
    <div className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-gray-50 p-2">
      <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border px-2 py-1 text-xs" placeholder="Business name" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-lg border px-2 py-1 text-xs" placeholder="Phone" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border px-2 py-1 text-xs" placeholder="Email" />
      <div className="flex gap-1.5">
        <button disabled={busy} onClick={save} className="rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
          Save
        </button>
        <button onClick={() => setOpen(false)} className="rounded-full px-3 py-1 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
