"use client";
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale =
    typeof window !== "undefined" && window.location.pathname.startsWith("/vi")
      ? "vi"
      : "en";
  return (
    <html lang={locale}>
      <body>
        <main>
          <h1>
            {locale === "vi"
              ? "Không thể tải trang."
              : "Unable to load this page."}
          </h1>
          <button onClick={reset}>
            {locale === "vi" ? "Thử lại" : "Try again"}
          </button>
        </main>
      </body>
    </html>
  );
}
