"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";
import type { ClientProfile } from "@/lib/marketplace/client";

/** Editable client info form on the account page (avatar + gender + age). */
export function ProfileForm({ initial }: { initial: ClientProfile | null }) {
  const t = useTranslations("client");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial?.fullName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [gender, setGender] = useState<"male" | "female" | "">(initial?.gender === "male" || initial?.gender === "female" ? initial.gender : "");
  const [age, setAge] = useState(initial?.age?.toString() ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentAvatar = preview ?? initial?.avatarUrl ?? null;

  const pickFile = (f: File | null) => {
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    if (fileRef.current?.files) {
      const dt = new DataTransfer();
      dt.items.add(f);
      fileRef.current.files = dt.files;
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const file = fileRef.current?.files?.[0];
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch("/api/client/avatar", { method: "POST", body: fd });
        const ujson = await up.json();
        if (!ujson.success) throw new Error(ujson.message ?? "Upload failed");
      }
      const res = await fetch("/api/client/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name || null,
          phone: phone || null,
          email: email || null,
          gender: gender || null,
          age: age ? Number(age) : null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded-xl border border-[#c5c6cd]/70 bg-white px-3.5 py-2.5 text-sm text-[#091426]";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eff1f3] text-[#9aa0a6]"
          aria-label={t("avatar")}
        >
          {currentAvatar ? (
            <img src={currentAvatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </button>
        <div className="text-xs text-[#45474c]">
          <p className="font-semibold text-[#091426]">{initial?.fullName || t("profileTitle")}</p>
          <p className="mt-0.5">{t("avatar")} — {t("optional")}</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <label className="text-xs font-semibold text-[#45474c]">
        {t("fullName")}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("fullNamePlaceholder")} className={`${input} mt-1`} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-[#45474c]">
          {t("phone")}
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phonePlaceholder")} dir="ltr" className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-[#45474c]">
          {t("email")}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" className={`${input} mt-1`} />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-[#45474c]">{t("gender")}</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(["male", "female"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  gender === g
                    ? "mp-solid border-transparent text-white"
                    : "border-[#c5c6cd]/70 bg-white text-[#45474c]"
                }`}
              >
                {t(`gender_${g}`)}
              </button>
            ))}
          </div>
        </div>
        <label className="text-xs font-semibold text-[#45474c]">
          {t("age")}
          <input value={age} onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ""))} type="number" min={5} max={120} className={`${input} mt-1`} />
        </label>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{t("saved")}</p>}
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mp-solid rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? t("saving") : t("save")}
      </button>
    </div>
  );
}
