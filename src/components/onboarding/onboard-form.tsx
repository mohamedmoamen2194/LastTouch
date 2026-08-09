"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/booking/logo";
import { BUSINESS_TYPE_CONFIGS } from "@/config/business-types";

export function OnboardForm() {
  const t = useTranslations("onboard");
  const router = useRouter();
  const locale = useLocale();

  const [businessType, setBusinessType] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = Object.values(BUSINESS_TYPE_CONFIGS);

  const submit = async () => {
    if (!businessName.trim() || !businessType) {
      setError(t("errorRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboard/tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          businessType,
          slug: slug || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.message);
        return;
      }
      router.push(`/${locale}/${json.data.slug}/dashboard`);
    } catch {
      setError(t("error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-8 flex justify-center">
        <Logo className="h-6 w-auto" />
      </div>
      <div className="rounded-2xl border border-[#c5c6cd]/60 bg-white p-5 shadow-sm md:p-8">
        <h1 className="text-2xl font-bold text-[#091426]">{t("title")}</h1>
        <p className="mt-2 text-base leading-relaxed text-[#45474c]">{t("subtitle")}</p>

        {error && <p className="mt-4 rounded-lg bg-[#ba1a1a] px-4 py-3 text-sm text-white">{error}</p>}

        {/* Business type */}
        <label className="mt-6 block text-sm font-semibold text-[#091426]">{t("type")}</label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {types.map((b) => (
            <button
              key={b.type}
              type="button"
              onClick={() => setBusinessType(b.type)}
              className="flex h-full flex-col items-center justify-center rounded-xl border p-4 text-center transition-colors"
              style={{
                borderColor: businessType === b.type ? "#091426" : "#c5c6cd",
                backgroundColor: businessType === b.type ? "#f2f4f6" : "#fff",
              }}
            >
              <p className="text-sm font-semibold leading-snug text-[#091426]">{b.label}</p>
              <p className="mt-1 text-xs text-[#45474c]">{b.employeeLabel}</p>
            </button>
          ))}
        </div>

        {/* Name */}
        <label className="mt-6 block text-sm font-semibold text-[#091426]">{t("name")}</label>
        <input
          value={businessName}
          onChange={(e) => {
            setBusinessName(e.target.value);
            if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
          }}
          placeholder={t("namePlaceholder")}
          className="mt-2 w-full rounded-lg border border-[#c5c6cd] px-4 py-3 text-sm outline-none focus:border-[#091426]"
        />

        {/* Slug */}
        <label className="mt-4 block text-sm font-semibold text-[#091426]">{t("address")}</label>
        <div className="mt-2 flex items-center rounded-lg border border-[#c5c6cd] px-3 focus-within:border-[#091426]">
          <span className="text-sm text-[#45474c]">{t("slugPrefix")}</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            className="w-full flex-1 border-none px-1 py-3 text-sm outline-none"
          />
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-8 w-full rounded-full bg-[#091426] px-8 py-3.5 text-base font-semibold text-white transition-colors hover:bg-[#1e293b] disabled:opacity-50"
        >
          {submitting ? t("creating") : t("create")}
        </button>
      </div>
    </div>
  );
}