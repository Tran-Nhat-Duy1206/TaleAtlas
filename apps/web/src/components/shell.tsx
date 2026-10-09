"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, useSyncExternalStore } from "react";
const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const locationSnapshot = () => window.location.search + window.location.hash;
const serverLocationSnapshot = () => "";
function subscribeLocation(notify: () => void) {
  window.addEventListener("popstate", notify);
  window.addEventListener("hashchange", notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener("hashchange", notify);
  };
}
import { branding } from "@/lib/branding";
import { dictionary, type Locale } from "@/lib/i18n";
import { catalogDictionary } from "@/lib/catalog-i18n";
import { authClient } from "@/lib/auth-client";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
export function Preferences({ locale }: { locale: Locale }) {
  const t = dictionary(locale);
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );
  return (
    <label className="theme-picker">
      {t.theme}
      <select
        aria-label={t.theme}
        value={mounted ? theme : "system"}
        onChange={(e) => setTheme(e.target.value)}
        disabled={!mounted}
      >
        <option value="light">{t.light}</option>
        <option value="dark">{t.dark}</option>
        <option value="system">{t.system}</option>
      </select>
    </label>
  );
}
export function Shell({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const t = dictionary(locale);
  const pathname = usePathname();
  const other = locale === "en" ? "vi" : "en";
  const { data: session } = authClient.useSession();
  const locationSuffix = useSyncExternalStore(
    subscribeLocation,
    locationSnapshot,
    serverLocationSnapshot,
  );
  const switched =
    pathname.replace(/^\/(en|vi)(?=\/|$)/, `/${other}`) + locationSuffix;
  return (
    <>
      <a className="skip-link" href="#main">
        {t.skip}
      </a>
      <header className="site-header">
        <Link
          href={`/${locale}`}
          className="wordmark"
          aria-label={`${branding.name} — ${t.home}`}
        >
          <span className="brand-mark" aria-hidden="true">
            {branding.logoGlyph}
            <span>{branding.logoAccent}</span>
          </span>
          {branding.name}
          <span className="version">V0</span>
        </Link>
        <nav
          aria-label={locale === "vi" ? "Điều hướng chính" : "Main navigation"}
        >
          <a href={`/${locale}/works`}>{catalogDictionary(locale).browse}</a>
          {session?.user.role === "admin" && (
            <a href={`/${locale}/admin/works`}>
              {catalogDictionary(locale).admin}
            </a>
          )}
          {/* Locale changes cross document/root-layout boundaries: use native navigation. */}
          <a
            href={switched}
            hrefLang={other}
            lang={other}
            aria-label={`${t.language}: ${other === "vi" ? "Tiếng Việt" : "English"}`}
          >
            {other === "vi" ? "VI" : "EN"}
          </a>
          <a
            className="nav-account"
            href={`/${locale}/${session ? "settings" : "login"}`}
          >
            {session ? t.settings : t.login}
            <span aria-hidden="true"> ↗</span>
          </a>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div>
          <Link className="footer-brand" href={`/${locale}`}>
            {branding.name}
          </Link>
          <p>{t.footer}</p>
        </div>
        <Preferences locale={locale} />
        <span className="footer-status">
          <span aria-hidden="true">●</span> {t.status}
        </span>
      </footer>
    </>
  );
}
