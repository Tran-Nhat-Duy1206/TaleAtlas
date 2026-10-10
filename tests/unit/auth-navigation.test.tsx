// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  verification: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  search: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    push: mocks.push,
    refresh: mocks.refresh,
  }),
  useSearchParams: () => mocks.search,
}));
vi.mock("../../apps/web/src/lib/auth-client", () => ({
  authClient: {
    signIn: { email: mocks.signIn },
    signUp: { email: mocks.signUp },
    sendVerificationEmail: mocks.verification,
  },
}));
import { AuthForm } from "../../apps/web/src/components/auth-form";
import { dictionary, type Locale } from "../../apps/web/src/lib/i18n";

// Synthetic fixtures only; never credentials for an actual account.
const email = "synthetic-auth-navigation@example.invalid";
const password = "synthetic-unit-password-only-123";
const requestId = "11111111-1111-4111-8111-111111111111";
const locales = ["en", "vi"] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.search = new URLSearchParams();
  for (const transport of [mocks.signIn, mocks.signUp, mocks.verification])
    transport.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => cleanup());

function fillEmail(locale: Locale) {
  fireEvent.change(screen.getByLabelText(dictionary(locale).email), {
    target: { value: email },
  });
}
function fillPassword(locale: Locale) {
  fireEvent.change(
    screen.getByLabelText(dictionary(locale).password, {
      selector: 'input[name="password"]',
    }),
    { target: { value: password } },
  );
}
function submitForm() {
  fireEvent.submit(screen.getByRole("button").closest("form")!);
}
async function expectCompletedSignIn() {
  await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  // Exact argument list also rejects callbackURL, redirect, or extra options.
  expect(mocks.signIn.mock.calls).toEqual([[{ email, password }]]);
  expect(mocks.signUp).not.toHaveBeenCalled();
  expect(mocks.verification).not.toHaveBeenCalled();
}
function expectNoNavigation() {
  expect(mocks.replace).not.toHaveBeenCalled();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
}

// Mocked client-component transport/navigation regression only. This does not
// execute Better Auth's redirect plugin, authenticate a user, establish a
// session, send email, or prove native browser navigation/backend behavior.
// The real dictionary, requestSignInReturn, AuthForm, and Next Link are retained.
describe("auth form navigation ownership (mocked transport only)", () => {
  describe.each(locales)("%s login", (locale) => {
    it("sends only credentials and replaces once with the validated same-locale request ID", async () => {
      const destination = `/${locale}/requests/${requestId}?q=${encodeURIComponent("Synthetic Đường về nhà")}&format=UNKNOWN`;
      mocks.search.set("callbackURL", `${destination}#discarded-fragment`);
      render(<AuthForm locale={locale} mode="login" />);
      fillEmail(locale);
      fillPassword(locale);
      submitForm();
      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledWith(destination),
      );
      await expectCompletedSignIn();
      expect(mocks.replace.mock.calls).toEqual([[destination]]);
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    });

    it.each([
      ["absent", null],
      ["external", "https://external.example.invalid/en/requests"],
      ["protocol-relative", "//external.example.invalid/en/requests"],
      ["cross-locale", "cross-locale"],
      ["traversal", "/requests/../../admin"],
      ["encoded traversal", "/requests/new%2f..%2fadmin"],
      ["backslash", "/requests\\external"],
    ] as const)(
      "falls back to locale settings for %s input",
      async (kind, input) => {
        const callback =
          kind === "cross-locale"
            ? `/${locale === "en" ? "vi" : "en"}/requests/${requestId}`
            : input?.startsWith("/requests")
              ? `/${locale}${input}`
              : input;
        if (callback !== null) mocks.search.set("callbackURL", callback);
        render(<AuthForm locale={locale} mode="login" />);
        fillEmail(locale);
        fillPassword(locale);
        submitForm();
        const destination = `/${locale}/settings`;
        await waitFor(() =>
          expect(mocks.replace).toHaveBeenCalledWith(destination),
        );
        await expectCompletedSignIn();
        expect(mocks.replace.mock.calls).toEqual([[destination]]);
        expect(mocks.push).not.toHaveBeenCalled();
        expect(mocks.refresh).not.toHaveBeenCalled();
      },
    );

    it.each(["INVALID_EMAIL_OR_PASSWORD", "EMAIL_NOT_VERIFIED"])(
      "does not navigate for a %s reply",
      async (code) => {
        mocks.search.set("callbackURL", `/${locale}/requests/${requestId}`);
        mocks.signIn.mockResolvedValue({ data: null, error: { code } });
        render(<AuthForm locale={locale} mode="login" />);
        fillEmail(locale);
        fillPassword(locale);
        submitForm();
        expect(await screen.findByRole("alert")).toHaveTextContent(
          code === "EMAIL_NOT_VERIFIED"
            ? dictionary(locale).unverified
            : dictionary(locale).invalidCredentials,
        );
        await expectCompletedSignIn();
        expectNoNavigation();
      },
    );
  });

  it.each(locales)(
    "%s registration keeps the absolute verification callback and app-router push",
    async (locale) => {
      mocks.search.set("callbackURL", "https://external.example.invalid/");
      const t = dictionary(locale);
      render(<AuthForm locale={locale} mode="register" />);
      fillEmail(locale);
      fillPassword(locale);
      fireEvent.change(screen.getByLabelText(t.name), {
        target: { value: "  Synthetic Reader  " },
      });
      fireEvent.change(screen.getByLabelText(t.confirmPassword), {
        target: { value: password },
      });
      submitForm();
      await waitFor(() =>
        expect(mocks.push).toHaveBeenCalledWith(`/${locale}/verify-email`),
      );
      await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
      expect(mocks.signUp.mock.calls).toEqual([
        [
          {
            email,
            password,
            name: "Synthetic Reader",
            callbackURL: `${window.location.origin}/${locale}/verify-email?verified=1`,
          },
        ],
      ]);
      expect(mocks.push.mock.calls).toEqual([[`/${locale}/verify-email`]]);
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.signIn).not.toHaveBeenCalled();
      expect(mocks.verification).not.toHaveBeenCalled();
    },
  );

  it.each(locales)(
    "%s verification resend keeps the absolute verification callback without navigation",
    async (locale) => {
      mocks.search.set("callbackURL", "https://external.example.invalid/");
      render(<AuthForm locale={locale} mode="verify-email" />);
      fillEmail(locale);
      submitForm();
      expect(await screen.findByRole("status")).toHaveTextContent(
        dictionary(locale).verifySent,
      );
      await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
      expect(mocks.verification.mock.calls).toEqual([
        [
          {
            email,
            callbackURL: `${window.location.origin}/${locale}/verify-email?verified=1`,
          },
        ],
      ]);
      expect(mocks.signIn).not.toHaveBeenCalled();
      expect(mocks.signUp).not.toHaveBeenCalled();
      expectNoNavigation();
    },
  );
});
