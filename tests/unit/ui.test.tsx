// @vitest-environment jsdom
import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
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
  reset: vi.fn(),
  requestReset: vi.fn(),
  verification: vi.fn(),
  signOut: vi.fn(),
  deleteUser: vi.fn(),
  useSession: vi.fn(),
  refetch: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  setTheme: vi.fn(),
  pathname: "/en/settings",
  suspendSearch: false,
  pendingSearch: new Promise<never>(() => {}),
  search: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    push: mocks.push,
    refresh: mocks.refresh,
  }),
  useSearchParams: () => {
    if (mocks.suspendSearch) throw mocks.pendingSearch;
    return mocks.search;
  },
  usePathname: () => mocks.pathname,
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: mocks.setTheme }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("../../apps/web/src/lib/auth-client", () => ({
  authClient: {
    signIn: { email: mocks.signIn },
    signUp: { email: mocks.signUp },
    resetPassword: mocks.reset,
    requestPasswordReset: mocks.requestReset,
    sendVerificationEmail: mocks.verification,
    signOut: mocks.signOut,
    deleteUser: mocks.deleteUser,
    useSession: mocks.useSession,
  },
}));
import { AuthForm } from "../../apps/web/src/components/auth-form";
import { Preferences, Shell } from "../../apps/web/src/components/shell";
import { Settings } from "../../apps/web/src/components/settings";
import { dictionary } from "../../apps/web/src/lib/i18n";
import { WorkEditor } from "../../apps/web/src/components/catalog/WorkEditor";
import { catalogDictionary } from "../../apps/web/src/lib/catalog-i18n";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/en/settings";
  mocks.suspendSearch = false;
  mocks.search = new URLSearchParams();
  mocks.useSession.mockReturnValue({
    data: null,
    isPending: true,
    error: null,
    refetch: mocks.refetch,
  });
  for (const fn of [
    mocks.signIn,
    mocks.signUp,
    mocks.reset,
    mocks.requestReset,
    mocks.verification,
    mocks.signOut,
    mocks.deleteUser,
  ])
    fn.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("catalog publication acknowledgment", () => {
  it.each(["create", "update", "visibility"])(
    "sends the actual checkbox boolean for %s",
    async (command) => {
      const fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "synthetic" }),
      });
      vi.stubGlobal("fetch", fetch);
      const d = catalogDictionary("en");
      render(
        <WorkEditor
          locale="en"
          id={command === "create" ? undefined : "synthetic"}
          revision={1}
          initial={{
            primaryTitle: "Synthetic",
            format: "NOVEL",
            visibility: "PUBLISHED",
            releaseStatus: "UNKNOWN",
            publicationReviewAcknowledged: true,
            source: { label: "Synthetic", citation: "Invented fixture" },
          }}
        />,
      );
      const checkbox = screen.getByRole("checkbox", { name: d.review });
      expect(checkbox).not.toBeChecked();
      const submit = () =>
        command === "visibility"
          ? fireEvent.click(
              screen.getByRole("button", { name: d.applyVisibility }),
            )
          : fireEvent.submit(
              screen.getByRole("button", { name: d.save }).closest("form")!,
            );
      submit();
      expect(fetch).not.toHaveBeenCalled();
      expect(screen.getByRole("status")).toHaveTextContent(d.reviewRequired);
      fireEvent.click(checkbox);
      submit();
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      expect(
        JSON.parse(fetch.mock.calls[0][1].body).publicationReviewAcknowledged,
      ).toBe(true);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: d.save })).not.toBeDisabled(),
      );
      fireEvent.change(screen.getByRole("combobox", { name: d.visibility }), {
        target: { value: "HIDDEN" },
      });
      fireEvent.click(checkbox);
      submit();
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      expect(
        JSON.parse(fetch.mock.calls[1][1].body).publicationReviewAcknowledged,
      ).toBe(false);
    },
  );
});
function submitForm() {
  const button = screen.getByRole("button", {
    name: /Create account|Tạo tài khoản|Reset password|Đặt lại mật khẩu|Sign in|Đăng nhập/,
  });
  fireEvent.submit(button.closest("form")!);
}

describe("localized account forms", () => {
  it.each(["en", "vi"] as const)(
    "rejects short passwords locally in %s",
    (locale) => {
      const t = dictionary(locale);
      render(<AuthForm locale={locale} mode="register" />);
      fireEvent.change(
        screen.getByLabelText(new RegExp(`^${t.password}`), {
          selector: 'input[name="password"]',
        }),
        { target: { value: "short" } },
      );
      fireEvent.change(screen.getByLabelText(t.confirmPassword), {
        target: { value: "short" },
      });
      submitForm();
      expect(screen.getByRole("alert")).toHaveTextContent(t.weak);
      expect(mocks.signUp).not.toHaveBeenCalled();
    },
  );
  it.each(["en", "vi"] as const)(
    "rejects password mismatch locally in %s",
    (locale) => {
      const t = dictionary(locale);
      render(<AuthForm locale={locale} mode="register" />);
      fireEvent.change(
        screen.getByLabelText(new RegExp(`^${t.password}`), {
          selector: 'input[name="password"]',
        }),
        { target: { value: "long-password-one" } },
      );
      fireEvent.change(screen.getByLabelText(t.confirmPassword), {
        target: { value: "long-password-two" },
      });
      submitForm();
      expect(screen.getByRole("alert")).toHaveTextContent(t.mismatch);
      expect(mocks.signUp).not.toHaveBeenCalled();
    },
  );
  it("uses a reset token parsed from the URL, never email or hidden defaults", async () => {
    mocks.search = new URLSearchParams("token=real-reset-token");
    const t = dictionary("en");
    render(<AuthForm locale="en" mode="reset-password" />);
    fireEvent.change(
      screen.getByLabelText(new RegExp(`^${t.password}`), {
        selector: 'input[name="password"]',
      }),
      { target: { value: "a-new-password-123" } },
    );
    fireEvent.change(screen.getByLabelText(t.confirmPassword), {
      target: { value: "a-new-password-123" },
    });
    submitForm();
    await waitFor(() =>
      expect(mocks.reset).toHaveBeenCalledWith({
        newPassword: "a-new-password-123",
        token: "real-reset-token",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(t.resetDone);
  });
  it("rejects a missing reset token without exposing a reset form", () => {
    render(<AuthForm locale="vi" mode="reset-password" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      dictionary("vi").invalidToken,
    );
    expect(
      screen.queryByLabelText(dictionary("vi").password),
    ).not.toBeInTheDocument();
    expect(mocks.reset).not.toHaveBeenCalled();
  });
  it("navigates once after sign-in without racing a router refresh", async () => {
    mocks.signIn.mockResolvedValue({ error: null });
    const t = dictionary("en");
    render(<AuthForm locale="en" mode="login" />);
    fireEvent.change(screen.getByLabelText(t.email), {
      target: { value: "reader@example.invalid" },
    });
    fireEvent.change(
      screen.getByLabelText(t.password, { selector: 'input[name="password"]' }),
      { target: { value: "a-long-password" } },
    );
    submitForm();
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/en/settings"),
    );
    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("maps server errors to localized text and never renders raw diagnostics", async () => {
    mocks.signIn.mockResolvedValue({
      error: { code: "UNKNOWN", message: "private database credentials" },
    });
    const t = dictionary("vi");
    render(<AuthForm locale="vi" mode="login" />);
    fireEvent.change(screen.getByLabelText(t.email), {
      target: { value: "reader@example.com" },
    });
    fireEvent.change(
      screen.getByLabelText(new RegExp(`^${t.password}`), {
        selector: 'input[name="password"]',
      }),
      { target: { value: "a-long-password" } },
    );
    submitForm();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      t.invalidCredentials,
    );
    expect(
      screen.queryByText(/private database credentials/),
    ).not.toBeInTheDocument();
  });
});

describe("appearance and session accessibility", () => {
  it.each(["en", "vi"] as const)(
    "exposes a labeled theme selector and applies user choice in %s",
    (locale) => {
      const t = dictionary(locale);
      render(<Preferences locale={locale} />);
      const select = screen.getByRole("combobox", { name: t.theme });
      expect(select).toHaveValue("system");
      expect(screen.getByRole("option", { name: t.light })).toHaveValue(
        "light",
      );
      expect(screen.getByRole("option", { name: t.dark })).toHaveValue("dark");
      expect(screen.getByRole("option", { name: t.system })).toHaveValue(
        "system",
      );
      fireEvent.change(select, { target: { value: "dark" } });
      expect(mocks.setTheme).toHaveBeenCalledWith("dark");
    },
  );
  it("announces loading without leaking account controls", () => {
    render(<Settings locale="vi" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      dictionary("vi").loading,
    );
    expect(
      screen.queryByRole("button", { name: dictionary("vi").deleteAction }),
    ).not.toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("announces a safe localized session error with a working retry button", () => {
    mocks.useSession.mockReturnValue({
      data: null,
      isPending: false,
      error: { message: "private session error" },
      refetch: mocks.refetch,
    });
    render(<Settings locale="en" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      dictionary("en").sessionError,
    );
    expect(screen.queryByText(/private session error/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: dictionary("en").retry }),
    );
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("redirects to the localized login route when the session disappears", async () => {
    mocks.useSession.mockReturnValue({
      data: null,
      isPending: false,
      error: null,
      refetch: mocks.refetch,
    });
    render(<Settings locale="vi" />);
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/vi/login"),
    );
  });
});

describe("router-synchronized native locale links", () => {
  let originalUrl: string;
  let originalState: unknown;
  let originalLang: string | null;
  const locationEvents = vi.fn();
  beforeEach(() => {
    originalUrl = window.location.href;
    originalState = window.history.state;
    originalLang = document.documentElement.getAttribute("lang");
    window.addEventListener("popstate", locationEvents);
    window.addEventListener("hashchange", locationEvents);
  });
  afterEach(() => {
    cleanup();
    window.removeEventListener("popstate", locationEvents);
    window.removeEventListener("hashchange", locationEvents);
    window.history.replaceState(originalState, "", originalUrl);
    if (originalLang === null) document.documentElement.removeAttribute("lang");
    else document.documentElement.setAttribute("lang", originalLang);
  });
  function setRouterLocation(url: string) {
    const route = new URL(url, window.location.href);
    mocks.pathname = route.pathname;
    mocks.search = new URLSearchParams(route.search);
  }
  function localeLink(locale: "en" | "vi") {
    return screen.getByRole("link", {
      name: locale === "vi" ? "Ngôn ngữ: English" : "Language: Tiếng Việt",
    });
  }
  function NavigationCommit({
    url,
    locale,
  }: {
    url: string;
    locale: "en" | "vi";
  }) {
    // Like Next's HistoryUpdater, commit the URL AFTER child render without
    // emitting popstate/hashchange. Updating location before rerender hides the bug.
    React.useInsertionEffect(() => {
      window.history.replaceState(null, "", url);
    }, [url]);
    return (
      <Shell locale={locale}>
        <h1>Destination content</h1>
      </Shell>
    );
  }
  it.each(["en", "vi"] as const)(
    "drops the form query on clean %s detail navigation without location events",
    (locale) => {
      const other = locale === "en" ? "vi" : "en";
      const initial = `/${locale}/requests/new?q=old%20title&format=UNKNOWN#draft`;
      const destination = `/${locale}/requests/synthetic-request`;
      window.history.replaceState(null, "", initial);
      setRouterLocation(initial);
      const { rerender } = render(
        <NavigationCommit url={initial} locale={locale} />,
      );
      expect(localeLink(locale)).toHaveAttribute(
        "href",
        `/${other}/requests/new?q=old%20title&format=UNKNOWN#draft`,
      );
      setRouterLocation(destination);
      rerender(<NavigationCommit url={destination} locale={locale} />);
      expect(window.location.pathname).toBe(destination);
      expect(window.location.search + window.location.hash).toBe("");
      expect(localeLink(locale)).toHaveAttribute(
        "href",
        `/${other}/requests/synthetic-request`,
      );
      expect(locationEvents).not.toHaveBeenCalled();
    },
  );
  it("tracks query-only replacement and removal while preserving raw encoding", () => {
    const initial = "/en/works?q=old#old";
    const destination =
      "/en/works?q=new%20title&tag=a&tag=b&empty=&literal=%2B#results";
    window.history.replaceState(null, "", initial);
    setRouterLocation(initial);
    const { rerender } = render(<NavigationCommit url={initial} locale="en" />);
    setRouterLocation(destination);
    rerender(<NavigationCommit url={destination} locale="en" />);
    expect(localeLink("en")).toHaveAttribute(
      "href",
      "/vi/works?q=new%20title&tag=a&tag=b&empty=&literal=%2B#results",
    );
    setRouterLocation("/en/works");
    rerender(<NavigationCommit url="/en/works" locale="en" />);
    expect(localeLink("en")).toHaveAttribute("href", "/vi/works");
    expect(locationEvents).not.toHaveBeenCalled();
  });
  it("rereads hash-only router changes even when pathname and query are unchanged", () => {
    const route = "/en/works?q=title%20one";
    const initial = `${route}#old`;
    window.history.replaceState(null, "", initial);
    setRouterLocation(initial);
    const { rerender } = render(<NavigationCommit url={initial} locale="en" />);
    for (const hash of ["#new", ""]) {
      const destination = route + hash;
      // Next publishes a fresh search-param object on canonical URL changes,
      // including hash-only navigation; its query text is deliberately identical.
      setRouterLocation(destination);
      rerender(<NavigationCommit url={destination} locale="en" />);
      expect(localeLink("en")).toHaveAttribute(
        "href",
        `/vi/works?q=title%20one${hash}`,
      );
    }
    expect(locationEvents).not.toHaveBeenCalled();
  });
  it("tracks hashchange and popstate, including restored pathname and query", () => {
    const initial = "/en/works?q=history";
    window.history.replaceState(null, "", initial);
    setRouterLocation(initial);
    const { rerender } = render(<NavigationCommit url={initial} locale="en" />);
    act(() => {
      window.history.replaceState(null, "", `${initial}#section`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(localeLink("en")).toHaveAttribute(
      "href",
      "/vi/works?q=history#section",
    );
    act(() => {
      window.history.replaceState(null, "", initial);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(localeLink("en")).toHaveAttribute("href", "/vi/works?q=history");
    for (const destination of [
      "/en/requests?state=SUBMITTED#previous",
      initial,
    ]) {
      setRouterLocation(destination);
      act(() => {
        window.history.replaceState(null, "", destination);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      rerender(<NavigationCommit url={destination} locale="en" />);
      expect(localeLink("en")).toHaveAttribute(
        "href",
        destination === initial
          ? "/vi/works?q=history"
          : "/vi/requests?state=SUBMITTED#previous",
      );
    }
  });
  it("limits suspended search parameters to the locale link, not the page", () => {
    const initial = "/en/works?q=title#results";
    window.history.replaceState(null, "", initial);
    setRouterLocation(initial);
    mocks.suspendSearch = true;
    render(<NavigationCommit url={initial} locale="en" />);
    expect(
      screen.getByRole("heading", { name: "Destination content" }),
    ).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: dictionary("en").theme }),
    ).toBeEnabled();
    expect(localeLink("en")).toHaveAttribute("href", "/vi/works");
    expect(localeLink("en").tagName).toBe("A");
    expect(localeLink("en")).toHaveAttribute("hreflang", "vi");
    expect(localeLink("en")).toHaveAttribute("lang", "vi");
  });
  it("hydrates the existing clean SSR anchor before restoring query and hash", () => {
    const initial = "/en/works?q=title%20one&literal=%2B#results";
    window.history.replaceState(null, "", initial);
    setRouterLocation(initial);
    const ui = (
      <Shell locale="en">
        <h1>Destination content</h1>
      </Shell>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui);
    expect(container.querySelector('a[lang="vi"]')).toHaveAttribute(
      "href",
      "/vi/works",
    );
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    render(ui, { container, hydrate: true, onRecoverableError });
    expect(localeLink("en")).toHaveAttribute(
      "href",
      "/vi/works?q=title%20one&literal=%2B#results",
    );
    expect(onRecoverableError).not.toHaveBeenCalled();
  });
});
