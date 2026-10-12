// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import "@testing-library/jest-dom/vitest";
const mocks = vi.hoisted(() => ({
  search: new URLSearchParams(),
  signIn: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.search,
  useRouter: () => ({
    replace: mocks.replace,
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("../../apps/web/src/lib/auth-client", () => ({
  authClient: { signIn: { email: mocks.signIn } },
}));
import {
  AuthForm,
  type AuthMode,
} from "../../apps/web/src/components/auth-form";
import { dictionary } from "../../apps/web/src/lib/i18n";
const modes: AuthMode[] = [
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "verify-email",
];
let root: Root | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.search = new URLSearchParams("token=synthetic-unit-reset-token");
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  cleanup();
  document.body.innerHTML = "";
});
describe.each(["en", "vi"] as const)(
  "%s auth native submission safety",
  (locale) => {
    it.each(modes)(
      "SSR %s is POST-only and disables every credential control before hydration",
      (mode) => {
        const holder = document.createElement("div");
        holder.innerHTML = renderToString(
          <AuthForm locale={locale} mode={mode} />,
        );
        const form = holder.querySelector("form")!;
        expect(form).not.toBeNull();
        expect(form.getAttribute("method")).toBe("post");
        expect(form.getAttribute("aria-busy")).toBe("true");
        expect(form.querySelector("fieldset")).toBeDisabled();
        for (const control of form.querySelectorAll("input,button"))
          expect(control).toBeDisabled();
        // Disabled fields are excluded from browser-native FormData even if values
        // were filled programmatically; no real auth or native navigation is claimed.
        for (const input of form.querySelectorAll("input"))
          input.value = "synthetic-unit-value";
        expect([...new FormData(form).keys()]).toEqual([]);
        expect(mocks.signIn).not.toHaveBeenCalled();
      },
    );
    it("enables controls only after actual React hydration and preserves the sole SDK login redirect", async () => {
      mocks.signIn.mockResolvedValue({ error: null });
      mocks.search = new URLSearchParams();
      const holder = document.createElement("div");
      document.body.append(holder);
      const element = <AuthForm locale={locale} mode="login" />;
      holder.innerHTML = renderToString(element);
      expect(holder.querySelector("fieldset")).toBeDisabled();
      await act(async () => {
        root = hydrateRoot(holder, element);
      });
      await waitFor(() =>
        expect(holder.querySelector("fieldset")).toBeEnabled(),
      );
      fireEvent.change(screen.getByLabelText(dictionary(locale).email), {
        target: { value: "synthetic-hydration@example.invalid" },
      });
      fireEvent.change(screen.getByLabelText(dictionary(locale).password), {
        target: { value: "synthetic-unit-password-123" },
      });
      fireEvent.submit(holder.querySelector("form")!);
      await waitFor(() =>
        expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
          `/${locale}/settings`,
        ),
      );
      expect(mocks.signIn.mock.calls).toEqual([
        [
          {
            email: "synthetic-hydration@example.invalid",
            password: "synthetic-unit-password-123",
          },
        ],
      ]);
      expect(holder.querySelector("form")!.method).toBe("post");
    });
    it("keeps hydrated controls disabled during a pending request without duplicating a command", async () => {
      let resolve: (value: { error: null }) => void = () => {};
      mocks.signIn.mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      mocks.search = new URLSearchParams();
      const { container } = render(<AuthForm locale={locale} mode="login" />);
      fireEvent.change(screen.getByLabelText(dictionary(locale).email), {
        target: { value: "synthetic-pending@example.invalid" },
      });
      fireEvent.change(screen.getByLabelText(dictionary(locale).password), {
        target: { value: "synthetic-unit-password-123" },
      });
      fireEvent.submit(container.querySelector("form")!);
      expect(container.querySelector("fieldset")).toBeDisabled();
      fireEvent.submit(container.querySelector("form")!);
      expect(mocks.signIn).toHaveBeenCalledTimes(1);
      await act(async () => resolve({ error: null }));
      await waitFor(() =>
        expect(container.querySelector("fieldset")).toBeEnabled(),
      );
    });
  },
);
