import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Providers, Shell } from "@/components/shell";
import { isLocale } from "@/lib/i18n";
import { branding } from "@/lib/branding";
import "../globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN || "http://localhost:3000"),
  title: { default: branding.name, template: `%s · ${branding.name}` },
  description: branding.description,
};
// This is a locale-scoped root layout. A layout above [locale] cannot read
// descendant parameters, so putting <html> there gives Vietnamese pages lang=en.
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <Providers>
          <Shell locale={locale}>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
