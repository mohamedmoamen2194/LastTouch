import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

/** Legacy worker home — attendance now lives inside the main tenant panel. */
export default async function WorkerPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  redirect(`/${locale}/${slug}/attendance`);
}
