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
  within,
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
    isRefetching: false,
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

describe("A6 header session presentation", () => {
  beforeEach(() => {
    mocks.refetch.mockReset();
  });
  function session(role = "user", emailVerified = true, id = "account-a") {
    return {
      user: {
        id,
        role,
        emailVerified,
        name: `PRIVATE_NAME_${id}`,
        email: `${id}@private.invalid`,
      },
      session: { id: `PRIVATE_SESSION_${id}`, token: `PRIVATE_TOKEN_${id}` },
    };
  }
  type Snapshot = {
    data: ReturnType<typeof session> | null | undefined;
    isPending: boolean | undefined;
    isRefetching: boolean;
    error: null | { message: string; stack?: string };
  };
  function setSession(overrides: Partial<Snapshot> = {}) {
    mocks.useSession.mockReturnValue({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: mocks.refetch,
      ...overrides,
    });
  }
  function header() {
    return within(screen.getByRole("banner"));
  }
  function account(state: string) {
    const node = screen.getByRole("banner").querySelector(".nav-account");
    expect(node).not.toBeNull();
    expect(node!.tagName).toBe("SPAN");
    expect(node).toHaveAttribute("data-session-state", state);
    return node!;
  }
  function noAccountLinks(locale: "en" | "vi") {
    const t = dictionary(locale);
    for (const name of [
      t.login,
      t.settings,
      t.library,
      locale === "vi" ? "Yêu cầu của tôi" : "My requests",
      catalogDictionary(locale).admin,
    ]) {
      expect(header().queryByRole("link", { name })).not.toBeInTheDocument();
    }
  }
  function noPrivateText() {
    expect(screen.getByRole("banner").innerHTML).not.toMatch(
      /PRIVATE_NAME_|PRIVATE_SESSION_|PRIVATE_TOKEN_|@private\.invalid|RAW_SESSION_SENTINEL|RAW_STACK_SENTINEL/,
    );
  }
  function page(locale: "en" | "vi") {
    return (
      <Shell locale={locale}>
        <h1>Public content</h1>
        <p role="status">Unrelated content status</p>
      </Shell>
    );
  }
  function publicControls(locale: "en" | "vi") {
    expect(
      header().getByRole("link", { name: catalogDictionary(locale).browse }),
    ).toHaveAttribute("href", `/${locale}/works`);
    expect(
      header().getByRole("link", {
        name: new RegExp(`— ${dictionary(locale).home}$`),
      }),
    ).toHaveAttribute("href", `/${locale}`);
    expect(
      header().getByRole("link", {
        name: locale === "en" ? "Language: Tiếng Việt" : "Ngôn ngữ: English",
      }),
    ).toHaveAttribute("lang", locale === "en" ? "vi" : "en");
    expect(
      screen.getByRole("heading", { name: "Public content" }),
    ).toBeVisible();
  }
  function pending(locale: "en" | "vi") {
    // Reproduce the wrong authentication claim before testing new wrapper structure.
    noAccountLinks(locale);
    const node = account("pending");
    expect(node).toHaveTextContent(dictionary(locale).loading);
    expect(
      within(node as HTMLElement).queryByRole("link"),
    ).not.toBeInTheDocument();
    expect(
      within(node as HTMLElement).queryByRole("button"),
    ).not.toBeInTheDocument();
    expect(header().getByRole("status")).toHaveAttribute("aria-live", "off");
    expect(header().queryByRole("alert")).not.toBeInTheDocument();
    noAccountLinks(locale);
    noPrivateText();
    publicControls(locale);
  }
  function authenticated(locale: "en" | "vi", admin: boolean) {
    const t = dictionary(locale);
    account("authenticated");
    expect(header().getByRole("link", { name: t.settings })).toHaveAttribute(
      "href",
      `/${locale}/settings`,
    );
    expect(header().getByRole("link", { name: t.library })).toHaveAttribute(
      "href",
      `/${locale}/library`,
    );
    expect(
      header().getByRole("link", {
        name: locale === "en" ? "My requests" : "Yêu cầu của tôi",
      }),
    ).toHaveAttribute("href", `/${locale}/requests`);
    expect(
      header().queryByRole("link", { name: t.login }),
    ).not.toBeInTheDocument();
    if (admin)
      expect(
        header().getByRole("link", { name: catalogDictionary(locale).admin }),
      ).toHaveAttribute("href", `/${locale}/admin/works`);
    else
      expect(
        header().queryByRole("link", { name: catalogDictionary(locale).admin }),
      ).not.toBeInTheDocument();
    noPrivateText();
    publicControls(locale);
  }
  describe.each(["en", "vi"] as const)("%s", (locale) => {
    it.each([
      ["null pending", { data: null, isPending: true }],
      ["retained ordinary pending", { data: session(), isPending: true }],
      ["retained admin pending", { data: session("admin"), isPending: true }],
      ["undefined data", { data: undefined }],
      [
        "unresolved pending flag",
        { data: session("admin"), isPending: undefined },
      ],
      [
        "background admin refetch",
        { data: session("admin"), isRefetching: true },
      ],
      [
        "pending takes priority over error",
        {
          data: session("admin"),
          isPending: true,
          error: { message: "RAW_SESSION_SENTINEL" },
        },
      ],
      [
        "refetch takes priority over error",
        {
          data: session("admin"),
          isRefetching: true,
          error: { message: "RAW_SESSION_SENTINEL" },
        },
      ],
    ] satisfies [string, Partial<Snapshot>][])(
      "suppresses account links for %s",
      (_label, snapshot) => {
        setSession(snapshot);
        render(page(locale));
        pending(locale);
      },
    );
    it.each([
      ["null data", null],
      ["cached admin", session("admin")],
    ] as const)(
      "shows only safe recovery UI on error with %s",
      (_label, data) => {
        setSession({
          data,
          error: {
            message: "RAW_SESSION_SENTINEL",
            stack: "RAW_STACK_SENTINEL",
          },
        });
        render(page(locale));
        noAccountLinks(locale);
        account("error");
        expect(header().getByRole("alert")).toHaveTextContent(
          dictionary(locale).sessionError,
        );
        const retry = header().getByRole("button", {
          name: dictionary(locale).retry,
        });
        expect(retry.tagName).toBe("BUTTON");
        expect(retry).not.toBeDisabled();
        noAccountLinks(locale);
        noPrivateText();
        publicControls(locale);
      },
    );
    it("shows sign-in only for resolved anonymous state", () => {
      setSession();
      render(page(locale));
      const node = account("anonymous");
      expect(
        within(node as HTMLElement).getByRole("link", {
          name: dictionary(locale).login,
        }),
      ).toHaveAttribute("href", `/${locale}/login`);
      expect(
        header()
          .getAllByRole("link")
          .map((link) => link.getAttribute("href")),
      ).toEqual([
        `/${locale}`,
        `/${locale}/works`,
        locale === "en" ? "/vi/settings" : "/en/settings",
        `/${locale}/login`,
      ]);
      noPrivateText();
    });
    it.each([
      ["ordinary", "user", true],
      ["admin", "admin", true],
      ["unverified", "user", false],
    ] as const)(
      "preserves resolved %s session semantics and navigation order",
      (_label, role, verified) => {
        mocks.pathname = `/${locale}/settings`;
        setSession({ data: session(role, verified) });
        render(page(locale));
        authenticated(locale, role === "admin");
        expect(
          header()
            .getAllByRole("link")
            .map((link) => link.getAttribute("href")),
        ).toEqual([
          `/${locale}`,
          `/${locale}/works`,
          `/${locale}/library`,
          `/${locale}/requests`,
          ...(role === "admin" ? [`/${locale}/admin/works`] : []),
          locale === "en" ? "/vi/settings" : "/en/settings",
          `/${locale}/settings`,
        ]);
      },
    );
    it("keeps the wrapper while A becomes unresolved then B and roles change", () => {
      setSession({ data: session("admin") });
      const view = render(page(locale));
      authenticated(locale, true);
      const wrapper = account("authenticated");
      setSession({ data: session("admin"), isRefetching: true });
      view.rerender(page(locale));
      pending(locale);
      expect(account("pending")).toBe(wrapper);
      setSession({ data: session("user", true, "account-b") });
      view.rerender(page(locale));
      authenticated(locale, false);
      expect(account("authenticated")).toBe(wrapper);
      setSession({ data: session("admin", true, "account-b") });
      view.rerender(page(locale));
      authenticated(locale, true);
      setSession({ data: session("user", true, "account-b") });
      view.rerender(page(locale));
      authenticated(locale, false);
      expect(account("authenticated")).toBe(wrapper);
    });
    it("deduplicates explicit retry, retains native button focus through rejection, and recovers", async () => {
      let rejectFirst!: (reason: Error) => void;
      let resolveSecond!: () => void;
      const first = new Promise<void>((_resolve, reject) => {
        rejectFirst = reject;
      });
      const second = new Promise<void>((resolve) => {
        resolveSecond = resolve;
      });
      mocks.refetch.mockReturnValueOnce(first).mockReturnValueOnce(second);
      const error = {
        message: "RAW_SESSION_SENTINEL",
        stack: "RAW_STACK_SENTINEL",
      };
      setSession({ data: session("admin"), error });
      const view = render(page(locale));
      const retry = header().getByRole("button", {
        name: dictionary(locale).retry,
      });
      retry.focus();
      act(() => {
        fireEvent.click(retry);
        fireEvent.click(retry);
      });
      expect(mocks.refetch).toHaveBeenCalledTimes(1);
      expect(mocks.refetch).toHaveBeenNthCalledWith(1);
      expect(account("pending")).toHaveTextContent(dictionary(locale).loading);
      expect(header().getByRole("status")).toHaveAttribute(
        "aria-live",
        "polite",
      );
      expect(retry).toHaveAttribute("aria-disabled", "true");
      expect(retry).not.toBeDisabled();
      expect(retry).toHaveFocus();
      noAccountLinks(locale);
      setSession({ data: session("admin"), isRefetching: true, error });
      view.rerender(page(locale));
      expect(header().getByRole("button")).toBe(retry);
      fireEvent.click(retry);
      expect(mocks.refetch).toHaveBeenCalledTimes(1);
      setSession({ data: session("admin"), error });
      await act(async () => {
        rejectFirst(new Error("RAW_SESSION_SENTINEL"));
        await first.catch(() => {});
      });
      view.rerender(page(locale));
      account("error");
      expect(header().getByRole("alert")).toHaveTextContent(
        dictionary(locale).sessionError,
      );
      expect(
        header().getByRole("button", { name: dictionary(locale).retry }),
      ).toBe(retry);
      expect(retry).not.toHaveAttribute("aria-disabled", "true");
      expect(retry).toHaveFocus();
      noPrivateText();
      fireEvent.click(retry);
      expect(mocks.refetch).toHaveBeenCalledTimes(2);
      expect(mocks.refetch).toHaveBeenNthCalledWith(2);
      setSession({ data: session("user", true, "account-b") });
      view.rerender(page(locale));
      expect(account("pending")).toHaveTextContent(dictionary(locale).loading);
      expect(header().getByRole("button")).toBe(retry);
      noAccountLinks(locale);
      await act(async () => {
        resolveSecond();
        await second;
      });
      authenticated(locale, false);
      expect(
        header().queryByRole("button", { name: dictionary(locale).retry }),
      ).not.toBeInTheDocument();
      expect(
        header().getByRole("link", { name: dictionary(locale).settings }),
      ).not.toHaveFocus();
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    });
    it("renders neutral SSR despite cached admin and hydrates safely with authenticated client cache", () => {
      mocks.pathname = `/${locale}/settings`;
      setSession({ data: session("admin") });
      const ui = page(locale);
      const container = document.createElement("div");
      container.innerHTML = renderToString(ui);
      const serverHeader = within(container).getByRole("banner");
      const serverAccount = serverHeader.querySelector(".nav-account");
      expect(serverAccount).toHaveAttribute("data-session-state", "pending");
      expect(serverAccount).toHaveTextContent(dictionary(locale).loading);
      expect(
        within(serverHeader)
          .getAllByRole("link")
          .map((link) => link.getAttribute("href")),
      ).toEqual([
        `/${locale}`,
        `/${locale}/works`,
        locale === "en" ? "/vi/settings" : "/en/settings",
      ]);
      expect(serverHeader.innerHTML).not.toMatch(/PRIVATE_|@private\.invalid/);
      document.body.appendChild(container);
      setSession({ data: session("user", true, "account-b") });
      const onRecoverableError = vi.fn();
      render(ui, { container, hydrate: true, onRecoverableError });
      authenticated(locale, false);
      expect(account("authenticated")).toBe(serverAccount);
      expect(onRecoverableError).not.toHaveBeenCalled();
    });
  });
});
