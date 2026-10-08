"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { dictionary, type Locale } from "@/lib/i18n";
import { Preferences } from "./shell";
export function Settings({ locale }: { locale: Locale }) {
  const t = dictionary(locale),
    router = useRouter();
  const { data: session, isPending, error, refetch } = authClient.useSession();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [deleteSent, setDeleteSent] = useState(false);
  useEffect(() => {
    if (!isPending && !error && !session) router.replace(`/${locale}/login`);
  }, [session, isPending, error, locale, router]);
  async function logout() {
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setMessage(t.genericError);
        return;
      }
      await refetch();
      router.replace(`/${locale}/login`);
      router.refresh();
    } catch {
      setMessage(t.genericError);
    } finally {
      setBusy(false);
    }
  }
  async function remove(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (data.get("confirm") !== "on") return;
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.deleteUser({
        password: String(data.get("password") ?? ""),
        callbackURL: `${window.location.origin}/${locale}`,
      });
      if (result.error) {
        setMessage(t.deleteError);
        return;
      }
      setDeleteSent(true);
    } catch {
      setMessage(t.deleteError);
    } finally {
      setBusy(false);
    }
  }
  if (isPending)
    return (
      <p className="loading" role="status">
        {t.loading}
      </p>
    );
  if (error)
    return (
      <div className="loading">
        <p role="alert">{t.sessionError}</p>
        <button className="button" onClick={() => void refetch()}>
          {t.retry}
        </button>
      </div>
    );
  if (!session)
    return (
      <p className="loading" role="status">
        {t.loading}
      </p>
    );
  return (
    <section className="settings-page">
      <div className="auth-heading">
        <p className="eyebrow">{t.privacy}</p>
        <h1>{t.settings}</h1>
        <p>{t.settingsIntro}</p>
      </div>
      {message && (
        <p className="notice error" role="alert">
          {message}
        </p>
      )}
      <div className="settings-card">
        <h2>{t.account}</h2>
        <dl>
          <div>
            <dt>{t.name}</dt>
            <dd>{session.user.name}</dd>
          </div>
          <div>
            <dt>{t.email}</dt>
            <dd>{session.user.email}</dd>
          </div>
          <div>
            <dt>{t.verifiedLabel}</dt>
            <dd>{session.user.emailVerified ? t.yes : t.no}</dd>
          </div>
        </dl>
      </div>
      <div className="settings-card">
        <h2>{t.preferences}</h2>
        <Preferences locale={locale} />
      </div>
      <div className="settings-card">
        <h2>{t.sessionTitle}</h2>
        <p>{t.sessionText}</p>
        <button
          className="button"
          disabled={busy}
          onClick={() => void logout()}
        >
          {busy ? t.working : t.logout}
        </button>
      </div>
      <div className="settings-card danger-card">
        <h2>{t.danger}</h2>
        <p>{t.dangerText}</p>
        {deleteSent && (
          <p className="notice success" role="status">
            {t.deleteSent}
          </p>
        )}
        <form onSubmit={remove} aria-busy={busy}>
          <label>
            {t.password}
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="confirm" required />
            {t.deleteConfirm}
          </label>
          <button
            className="button danger-button"
            type="submit"
            disabled={busy || deleteSent}
          >
            {busy ? t.working : t.deleteAction}
          </button>
        </form>
      </div>
    </section>
  );
}
