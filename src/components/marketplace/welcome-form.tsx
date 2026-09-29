"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Camera } from "lucide-react";

/** First-run client profile completion (after client sign-up). */
export function WelcomeForm({ initialEmail }: { initialEmail: string }) {
  const t = useTranslations("client");
  const locale = useLocale();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [age, setAge] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFile = (f: File | null) => {
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    if (fileRef.current?.files) {
      const dt = new DataTransfer();
      dt.items.add(f);
      fileRef.current.files = dt.files;
    }
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError(t("welcomeNameRequired"));
    if (phone.trim().length < 6) return setError(t("welcomePhoneRequired"));
    if (!gender) return setError(t("welcomeGenderRequired"));
    setBusy(true);
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
          fullName: name.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          gender,
          age: age ? Number(age) : null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message ?? "Failed");
      router.push(`/${locale}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-xl border border-[#c5c6cd]/70 bg-white px-3.5 py-2.5 text-sm text-[#091426]";

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[#eff1f3] text-[#9aa0a6]"
        aria-label={t("avatar")}
      >
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <Camera className="h-6 w-6" />
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      <label className="text-xs font-semibold text-[#45474c]">
        {t("fullName")} *
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("fullNamePlaceholder")} className={`${input} mt-1`} />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-[#45474c]">
          {t("phone")} *
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phonePlaceholder")} dir="ltr" className={`${input} mt-1`} />
        </label>
        <label className="text-xs font-semibold text-[#45474c]">
          {t("email")} ({t("optional")})
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" dir="ltr" className={`${input} mt-1`} />
        </label>
      </div>
      <div>
        <p className="text-xs font-semibold text-[#45474c]">{t("gender")} *</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {(["male", "female"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                gender === g
                  ? "border-[#091426] bg-[#091426] text-white"
                  : "border-[#c5c6cd]/70 bg-white text-[#45474c]"
              }`}
            >
              {t(`gender_${g}`)}
            </button>
          ))}
        </div>
      </div>
      <label className="text-xs font-semibold text-[#45474c]">
        {t("age")} ({t("optional")})
        <input value={age} onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ""))} type="number" min={5} max={120} className={`${input} mt-1`} />
      </label>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="mt-1 rounded-full bg-[#091426] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? t("saving") : t("welcomeDone")}
      </button>
    </div>
  );
}
