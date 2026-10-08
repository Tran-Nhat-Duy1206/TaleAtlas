import { notFound, redirect } from "next/navigation";
import { Settings } from "@/components/settings";
import { isLocale } from "@/lib/i18n";
import { privateMetadata } from "@/lib/page-metadata";
import { getSession } from "@/server/session";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return privateMetadata(locale, "settings");
}
export default async function Page({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  if (!(await getSession())) redirect(`/${locale}/login`);
  return <Settings locale={locale} />;
}
