import { AuthPage } from "@/components/auth-page";
import { isLocale } from "@/lib/i18n";
import { privateMetadata } from "@/lib/page-metadata";
import { notFound } from "next/navigation";
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return privateMetadata(locale, "reset-password");
}
export default function Page({ params }: Props) {
  return <AuthPage params={params} mode="reset-password" />;
}
