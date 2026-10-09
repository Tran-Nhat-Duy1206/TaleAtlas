"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { branding } from "@/lib/branding";
import { dictionary, type Locale } from "@/lib/i18n";
export type AuthMode =
  | "login"
  | "register"
  | "forgot-password"
  | "reset-password"
  | "verify-email";
export function AuthForm({ locale, mode }: { locale: Locale; mode: AuthMode }) {
  const t = dictionary(locale),
    router = useRouter(),
    search = useSearchParams();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const token = search.get("token");
  const verified =
    mode === "verify-email" &&
    search.get("verified") === "1" &&
    !search.get("error");
  const title =
    mode === "login"
      ? t.login
      : mode === "register"
        ? t.register
        : mode === "forgot-password"
          ? t.forgotTitle
          : mode === "reset-password"
            ? t.resetTitle
            : t.verifyTitle;
  const intro =
    mode === "login"
      ? t.loginIntro
      : mode === "register"
        ? t.registerIntro
        : mode === "forgot-password"
          ? t.forgotIntro
          : mode === "reset-password"
            ? t.resetIntro
            : t.verifyIntro;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    const data = new FormData(e.currentTarget),
      email = String(data.get("email") ?? ""),
      password = String(data.get("password") ?? "");
    if (
      (mode === "register" || mode === "reset-password") &&
      password.length < 12
    ) {
      setError(t.weak);
      return;
    }
    if (
      (mode === "register" || mode === "reset-password") &&
      password !== data.get("confirm")
    ) {
      setError(t.mismatch);
      return;
    }
    setBusy(true);
    try {
      let result;
      const callback = `${window.location.origin}/${locale}/verify-email?verified=1`;
      if (mode === "login")
        result = await authClient.signIn.email({
          email,
          password,
          callbackURL: `/${locale}/settings`,
        });
      else if (mode === "register")
        result = await authClient.signUp.email({
          email,
          password,
          name: String(data.get("name") ?? "").trim(),
          callbackURL: callback,
        });
      else if (mode === "forgot-password")
        result = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/${locale}/reset-password`,
        });
      else if (mode === "reset-password") {
        if (!token) {
          setError(t.invalidToken);
          return;
        }
        result = await authClient.resetPassword({
          newPassword: password,
          token,
        });
      } else
        result = await authClient.sendVerificationEmail({
          email,
          callbackURL: callback,
        });
      if (result.error) {
        const code = result.error.code;
        setError(
          code === "EMAIL_NOT_VERIFIED"
            ? t.unverified
            : mode === "login"
              ? t.invalidCredentials
              : mode === "register"
                ? t.exists
                : mode === "reset-password"
                  ? t.invalidToken
                  : t.genericError,
        );
        return;
      }
      if (mode === "login") {
        // The destination navigation already fetches fresh authenticated server data.
        // Refreshing before replace commits races/cancels its RSC stream.
        router.replace(`/${locale}/settings`);
      } else if (mode === "register") router.push(`/${locale}/verify-email`);
      else
        setSuccess(
          mode === "forgot-password"
            ? t.resetSent
            : mode === "reset-password"
              ? t.resetDone
              : t.verifySent,
        );
    } catch {
      setError(t.genericError);
    } finally {
      setBusy(false);
    }
  }
  const hasEmail = mode !== "reset-password",
    hasPassword =
      mode === "login" || mode === "register" || mode === "reset-password";
  const missingToken =
    mode === "reset-password" && (!token || !!search.get("error"));
  return (
    <section className="auth-page">
      <div className="auth-heading">
        <p className="eyebrow">
          {branding.name} / {t.account}
        </p>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      <div className="auth-card">
        {verified ? (
          <>
            <p className="notice success" role="status">
              {t.verified}
            </p>
            <Link className="button primary" href={`/${locale}/login`}>
              {t.login}
            </Link>
          </>
        ) : missingToken ? (
          <>
            <p className="notice error" role="alert">
              {t.invalidToken}
            </p>
            <Link
              className="button primary"
              href={`/${locale}/forgot-password`}
            >
              {t.sendReset}
            </Link>
          </>
        ) : (
          <form onSubmit={submit} aria-busy={busy}>
            {mode === "verify-email" && search.get("error") && (
              <p className="notice error" role="alert">
                {t.verificationFailed}
              </p>
            )}
            {mode === "register" && (
              <label>
                {t.name}
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </label>
            )}
            {hasEmail && (
              <label>
                {t.email}
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
            )}
            {hasPassword && (
              <label>
                {t.password}
                <input
                  name="password"
                  aria-label={t.password}
                  aria-describedby={
                    mode === "login" ? undefined : "password-hint"
                  }
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                />
                {mode !== "login" && (
                  <small id="password-hint">{t.passwordHint}</small>
                )}
              </label>
            )}
            {(mode === "register" || mode === "reset-password") && (
              <label>
                {t.confirmPassword}
                <input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                />
              </label>
            )}
            {mode === "login" && (
              <Link className="form-link" href={`/${locale}/forgot-password`}>
                {t.forgot}
              </Link>
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            {success && (
              <p className="notice success" role="status">
                {success}
              </p>
            )}
            <button
              className="button primary full"
              disabled={busy || (mode === "reset-password" && !!success)}
              type="submit"
            >
              {busy
                ? t.working
                : mode === "login"
                  ? t.login
                  : mode === "register"
                    ? t.register
                    : mode === "forgot-password"
                      ? t.sendReset
                      : mode === "reset-password"
                        ? t.reset
                        : t.resend}
              <span aria-hidden="true">↗</span>
            </button>
            {mode === "login" && (
              <Link className="form-link" href={`/${locale}/verify-email`}>
                {t.resend}
              </Link>
            )}
            {mode === "register" && <p className="form-note">{t.authNote}</p>}
          </form>
        )}
        <div className="auth-bottom">
          {mode === "login" ? (
            <>
              {t.noAccount}{" "}
              <Link href={`/${locale}/register`}>{t.register}</Link>
            </>
          ) : mode === "register" ? (
            <>
              {t.hasAccount} <Link href={`/${locale}/login`}>{t.login}</Link>
            </>
          ) : (
            <Link href={`/${locale}/login`}>{t.backLogin}</Link>
          )}
        </div>
      </div>
    </section>
  );
}
