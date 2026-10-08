import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AuthForm, type AuthMode } from "./auth-form";
import { dictionary, isLocale } from "@/lib/i18n";
export async function AuthPage({
  params,
  mode,
}: {
  params: Promise<{ locale: string }>;
  mode: AuthMode;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <Suspense
      fallback={
        <p className="loading" role="status">
          {dictionary(locale).loading}
        </p>
      }
    >
      <AuthForm locale={locale} mode={mode} />
    </Suspense>
  );
}
