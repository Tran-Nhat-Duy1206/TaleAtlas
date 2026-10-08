import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dictionary, isLocale } from "@/lib/i18n";
import { branding } from "@/lib/branding";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dictionary(locale);
  return {
    title: branding.name,
    description: t.intro,
    alternates: {
      canonical: `/${locale}`,
      languages: { en: "/en", vi: "/vi", "x-default": "/en" },
    },
    openGraph: {
      title: branding.name,
      description: t.intro,
      locale: locale === "vi" ? "vi_VN" : "en_US",
      type: "website",
    },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = dictionary(locale);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" />
            {t.eyebrow}
          </p>
          <h1>{t.headline}</h1>
          <p className="lead">{t.intro}</p>
          <div className="hero-actions">
            <Link className="button primary" href={`/${locale}/register`}>
              {t.start}
              <span aria-hidden="true">↗</span>
            </Link>
            <a className="text-link" href="#foundation">
              {t.learn} <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
        <div className="atlas-art" aria-hidden="true">
          <div className="art-grid" />
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-book">
            <span>{branding.monogram}</span>
            <div className="book-lines" />
            <small>{t.artVolume}</small>
          </div>
          <span className="art-star">✳</span>
          <span className="art-label">{t.artLabel}</span>
          <span className="art-coordinate">{t.artCoordinate}</span>
        </div>
      </section>
      <section id="foundation" className="foundation">
        <div className="section-heading">
          <span className="eyebrow">01 / {t.status}</span>
          <h2>{t.foundation}</h2>
          <p>{t.foundationText}</p>
        </div>
        <div className="feature-grid">
          {[
            [t.accountTitle, t.accountText, "↗"],
            [t.languageTitle, t.languageText, "文"],
            [t.themeTitle, t.themeText, "◐"],
          ].map(([title, text, icon], i) => (
            <article className="feature" key={title}>
              <div className="feature-top">
                <span className="feature-icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="feature-number">0{i + 1}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <aside className="future-note">
        <span aria-hidden="true">✳</span>
        <div>
          <h2>{t.future}</h2>
          <p>{t.futureText}</p>
        </div>
      </aside>
    </>
  );
}
