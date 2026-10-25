import { test, expect, type Page } from "../helpers/browser-test";
import { randomUUID } from "node:crypto";
import type { Browser, Locator } from "@playwright/test";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import { requestDictionary } from "../../apps/web/src/lib/request-i18n";
import { publicCopy } from "../../apps/web/src/components/catalog/query";
import { dictionary } from "../../apps/web/src/lib/i18n";

// Browser acceptance only: real SMTP verification, cookies, Next UI and APIs.
// SQL is confined to guarded UUID-owned fixture inspection, role grant and cleanup.
// This does not cover approval or a published-result lifecycle.
test.describe.configure({ retries: 0 });
async function requestScenario(
  browser: Browser,
  page: Page,
  baseURL: string | undefined,
) {
  // Match the isolated port selected by the shared config: local 3010, CI 3000.
  expect(baseURL).toBe(
    `${process.env.TALEATLAS_TEST_NATIVE_SERVER_MODE === "production" ? "https" : "http"}://127.0.0.1:${Number(process.env.E2E_PORT ?? "3000")}`,
  );
  const { client: sql } = createDatabase(requireTestDatabase());
  const run = randomUUID();
  const accounts: { email: string; id?: string }[] = [];
  const createdIds = new Set<string>();
  // Simulate the configured self-hosted trusted proxy, as the SQL auth fixture
  // does: isolated documentation-range IPs prevent unrelated browser specs from
  // sharing the real 3/min signup bucket. These headers grant no user identity
  // or role and do not prove a deployed proxy overwrites untrusted client input.
  // Five UUID-derived groups plus the context discriminator form six suffix
  // groups: together with 2001:db8, each address has exactly eight IPv6 groups.
  const proxyScope = run
    .replace(/-/g, "")
    .slice(0, 20)
    .match(/.{4}/g)!
    .join(":");
  const proxyHeaders = (context: number) => ({
    "x-real-ip": `2001:db8:${proxyScope}:${context}`,
  });
  await page.context().setExtraHTTPHeaders(proxyHeaders(1));
  const otherContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: proxyHeaders(2),
  });
  const anonymousContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: proxyHeaders(3),
  });
  const other = await otherContext.newPage();
  const anonymous = await anonymousContext.newPage();
  async function signUp(target: Page) {
    const account: { email: string; id?: string } = {
      email: `requests-${run}-${randomUUID()}@example.invalid`,
    };
    accounts.push(account); // Discover by email even if registration fails midway.
    await target.goto("/en/register");
    await target.getByLabel("Your name").fill(`Synthetic reader ${run}`);
    await target.getByLabel("Email address").fill(account.email);
    await target
      .getByLabel("Password", { exact: true })
      .fill("Synthetic-e2e-password-17!");
    await target
      .getByLabel("Confirm password")
      .fill("Synthetic-e2e-password-17!");
    const signedUp = target.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-up/email") &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await target.getByRole("button", { name: "Create account" }).click();
    expect((await signedUp).status()).toBe(200);
    await expect(target).toHaveURL(/\/en\/verify-email$/, { timeout: 30_000 });
    let link: string | undefined;
    await expect
      .poll(
        async () => {
          const response = await target.request.get(
            "http://127.0.0.1:1026/messages",
          );
          expect(response.status()).toBe(200);
          const messages: { recipients: string[]; text: string }[] =
            await response.json();
          link = [...messages]
            .reverse()
            .find((m) => m.recipients.includes(account.email))
            ?.text.match(
              /https?:\/\/127\.0\.0\.1:\d+\/api\/auth\/verify-email[^\s<>]+/,
            )?.[0];
          return Boolean(link);
        },
        { timeout: 15_000 },
      )
      .toBe(true);
    expect(new URL(link!).origin).toBe(baseURL);
    await target.goto(link!);
    await expect(
      target.getByText("Your email is verified. You can now sign in."),
    ).toBeVisible({ timeout: 15_000 });
    await target
      .getByRole("link", { name: "Sign in", exact: true })
      .last()
      .click();
    await target.getByLabel("Email address").fill(account.email);
    await target
      .getByLabel("Password", { exact: true })
      .fill("Synthetic-e2e-password-17!");
    const signedIn = target.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-in/email") &&
        r.request().method() === "POST",
      { timeout: 45_000 },
    );
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    expect((await signedIn).status()).toBe(200);
    await expect(target).toHaveURL(/\/en\/settings$/, { timeout: 30_000 });
    requireTestDatabase();
    const [row] =
      await sql`select id, role, email_verified from users where email = ${account.email}`;
    expect(row?.email_verified).toBe(true);
    expect(row?.role).toBe("user");
    account.id = String(row!.id);
    return account;
  }
  async function cleanup() {
    try {
      requireTestDatabase();
      // Discover all partial POSTs by this run's registered emails, even when a
      // response assertion failed before recording its request or account ID.
      for (const account of accounts) {
        const users =
          await sql`select id from users where email = ${account.email}`;
        for (const user of users) {
          const userId = String(user.id);
          if (account.id) expect(userId).toBe(account.id);
          const requests =
            await sql`select id from work_requests where owner_user_id = ${userId}`;
          for (const request of requests) createdIds.add(String(request.id));
        }
      }
      for (const id of createdIds) {
        await sql`delete from work_request_supporters where request_id = ${id}`;
        await sql`delete from ingestion_jobs where request_id = ${id}`;
        await sql`delete from request_events where request_id = ${id}`;
        await sql`delete from work_requests where id = ${id}`;
      }
      for (const account of accounts) {
        const users =
          await sql`select id from users where email = ${account.email}`;
        for (const user of users) {
          const id = String(user.id);
          await sql`delete from users where id = ${id} and email = ${account.email}`;
          await sql`delete from rate_limits where key = ${`catalog.write:${id}`}`;
        }
        await sql`delete from verifications where identifier like ${`%${account.email}%`}`;
      }
    } finally {
      await sql.end();
      await otherContext.close();
      await anonymousContext.close();
    }
  }
  return { sql, run, accounts, createdIds, other, anonymous, signUp, cleanup };
}

// Real rendered boxes and text fragments, not screenshots or CSS declarations.
async function myRequestsLayout(
  page: Page,
  locale: "en" | "vi",
  width: number,
  longTitles: string[] = [],
) {
  const t = requestDictionary(locale);
  const main = page.getByRole("main");
  const heading = main.getByRole("heading", {
    level: 1,
    name: t.mine,
    exact: true,
  });
  const header = main.locator("header");
  const edit = header.getByRole("link", {
    name: locale === "vi" ? "Đề xuất chỉnh sửa của tôi" : "My edit suggestions",
    exact: true,
  });
  const create = header.getByRole("link", { name: t.new, exact: true });
  const owned = main.getByRole("region", { name: t.owned, exact: true });
  const followed = main.getByRole("region", { name: t.followed, exact: true });
  await expect(heading).toBeVisible();
  await expect(edit).toHaveAttribute("href", `/${locale}/edit-suggestions`);
  await expect(create).toHaveAttribute("href", `/${locale}/requests/new`);
  await expect(owned).toHaveAttribute(
    "aria-labelledby",
    "owned-requests-heading",
  );
  await expect(followed).toHaveAttribute(
    "aria-labelledby",
    "followed-requests-heading",
  );
  await expect(
    owned.getByRole("heading", { level: 2, name: t.owned, exact: true }),
  ).toBeVisible();
  await expect(
    followed.getByRole("heading", { level: 2, name: t.followed, exact: true }),
  ).toBeVisible();
  expect(
    await owned.evaluate((element) =>
      element.nextElementSibling?.getAttribute("aria-labelledby"),
    ),
  ).toBe("followed-requests-heading");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const bounds = async (locator: Locator) => {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    return box!;
  };
  const root = await heading.evaluate((element) => {
    const rect = element.closest("section")!.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const boxes = await Promise.all(
    [header, heading, edit, create, owned, followed].map(bounds),
  );
  const [headerBox, headingBox, editBox, createBox, ownedBox, followedBox] =
    boxes;
  const tolerance = 2;
  for (const box of [root, ...boxes]) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.x).toBeGreaterThanOrEqual(-tolerance);
    expect(box.x + box.width).toBeLessThanOrEqual(width + tolerance);
    expect(box.x).toBeGreaterThanOrEqual(root.x - tolerance);
    expect(box.x + box.width).toBeLessThanOrEqual(
      root.x + root.width + tolerance,
    );
  }
  const intersects = (a: typeof root, b: typeof root) =>
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > tolerance &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > tolerance;
  expect(intersects(headingBox!, editBox!)).toBe(false);
  expect(intersects(headingBox!, createBox!)).toBe(false);
  expect(intersects(editBox!, createBox!)).toBe(false);
  expect(ownedBox!.y - (headerBox!.y + headerBox!.height)).toBeGreaterThan(
    tolerance,
  );
  expect(followedBox!.y - (ownedBox!.y + ownedBox!.height)).toBeGreaterThan(
    tolerance,
  );
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(overflow.viewport).toBe(width);
  expect(overflow.document).toBeLessThanOrEqual(width + tolerance);
  expect(overflow.body).toBeLessThanOrEqual(width + tolerance);
  for (const region of [owned, followed]) {
    const regionBox = await bounds(region);
    for (const card of await region.getByRole("listitem").all()) {
      const cardBox = await bounds(card);
      expect(cardBox.x).toBeGreaterThanOrEqual(regionBox.x - tolerance);
      expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(
        regionBox.x + regionBox.width + tolerance,
      );
      expect(cardBox.y).toBeGreaterThanOrEqual(regionBox.y - tolerance);
      expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(
        regionBox.y + regionBox.height + tolerance,
      );
    }
  }

  // Check actual line fragments: a wide element box alone can hide overflowing
  // or clipped text. Long valid titles must wrap on the narrow viewport.
  for (const title of longTitles) {
    const link = main.getByRole("link", { name: title, exact: true });
    await expect(link).toBeVisible();
    const text = await link.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const card = element.closest("li, article")!.getBoundingClientRect();
      return {
        card: {
          left: card.left,
          right: card.right,
          top: card.top,
          bottom: card.bottom,
        },
        rects: Array.from(range.getClientRects(), (r) => ({
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
        })).filter((r) => r.right > r.left),
      };
    });
    expect(text.rects.length).toBeGreaterThan(0);
    for (const rect of text.rects) {
      expect(rect.left).toBeGreaterThanOrEqual(
        Math.max(0, text.card.left) - tolerance,
      );
      expect(rect.right).toBeLessThanOrEqual(
        Math.min(width, text.card.right) + tolerance,
      );
      expect(rect.top).toBeGreaterThanOrEqual(text.card.top - tolerance);
      expect(rect.bottom).toBeLessThanOrEqual(text.card.bottom + tolerance);
    }
    if (width === 375) {
      const lines = new Set(text.rects.map((rect) => Math.round(rect.top)));
      expect(
        lines.size,
        "Long title has multiple rendered lines",
      ).toBeGreaterThan(1);
    }
  }
  // Genuine Tab traversal preserves header actions, owned links, then each
  // followed link/action; focus() only establishes the starting point.
  await edit.focus();
  await expect(edit).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(create).toBeFocused();
  if (longTitles.length) {
    const ordered = [
      ...(await owned.getByRole("link").all()),
      ...(await followed
        .getByRole("link")
        .or(followed.getByRole("button"))
        .all()),
    ];
    for (const target of ordered) {
      await page.keyboard.press("Tab");
      await expect(target).toBeFocused();
    }
  }
}

// Scope geometry to the actual create/edit form, never the My requests index.
async function progressiveRequestLayout(
  page: Page,
  form: Locator,
  width: number,
) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const geometry = await form.evaluate((element) => {
    const rect = (node: Element) => {
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
      };
    };
    return {
      form: rect(element),
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      controls: Array.from(element.querySelectorAll("input, select, textarea"))
        .filter((control) => control.getClientRects().length > 0)
        .map((control) => ({
          box: rect(control),
          container: rect(control.closest("label") ?? control.parentElement!),
          textarea: control.tagName === "TEXTAREA",
        })),
      // Measure actual wrapped label text fragments, not just their container.
      labels: Array.from(element.querySelectorAll("label")).flatMap((label) => {
        if (!label.getClientRects().length) return [];
        const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
        const fragments = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          if (
            !node.textContent?.trim() ||
            node.parentElement?.closest("textarea, select")
          )
            continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          fragments.push(
            ...Array.from(range.getClientRects(), (box) => ({
              left: box.left,
              right: box.right,
              top: box.top,
              bottom: box.bottom,
            })).filter((box) => box.right > box.left),
          );
        }
        return [{ box: rect(label), fragments }];
      }),
    };
  });
  const tolerance = 2;
  expect(geometry.viewport).toBe(width);
  expect(geometry.document).toBeLessThanOrEqual(width + tolerance);
  expect(geometry.body).toBeLessThanOrEqual(width + tolerance);
  expect(geometry.form.left).toBeGreaterThanOrEqual(-tolerance);
  expect(geometry.form.right).toBeLessThanOrEqual(width + tolerance);
  expect(geometry.controls.length).toBeGreaterThanOrEqual(3);
  for (const { box, container, textarea } of geometry.controls) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.left).toBeGreaterThanOrEqual(
      Math.max(0, geometry.form.left, container.left) - tolerance,
    );
    expect(box.right).toBeLessThanOrEqual(
      Math.min(width, geometry.form.right, container.right) + tolerance,
    );
    expect(box.top).toBeGreaterThanOrEqual(container.top - tolerance);
    expect(box.bottom).toBeLessThanOrEqual(container.bottom + tolerance);
    if (textarea)
      expect(box.width).toBeGreaterThanOrEqual(container.width - tolerance);
  }
  if (width === 375) {
    expect(
      geometry.labels.some(
        ({ fragments }) =>
          new Set(fragments.map((fragment) => Math.round(fragment.top))).size >
          1,
      ),
    ).toBe(true);
  }
  for (const { box, fragments } of geometry.labels) {
    expect(fragments.length).toBeGreaterThan(0);
    for (const fragment of fragments) {
      expect(fragment.left).toBeGreaterThanOrEqual(
        Math.max(0, box.left) - tolerance,
      );
      expect(fragment.right).toBeLessThanOrEqual(
        Math.min(width, box.right) + tolerance,
      );
      expect(fragment.top).toBeGreaterThanOrEqual(box.top - tolerance);
      expect(fragment.bottom).toBeLessThanOrEqual(box.bottom + tolerance);
    }
  }
}

test("verified request ownership, reviewed equivalence, following and private lifecycle", async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(360_000);
  const { sql, run, accounts, createdIds, other, anonymous, signUp, cleanup } =
    await requestScenario(browser, page, baseURL);
  const title = `Đường Hư Cấu ${run}`;
  const notes = `Synthetic private owner notes ${run}`;
  const privateTitle = `Đường Riêng Tư ${run}`;
  const vi = requestDictionary("vi");
  const en = requestDictionary("en");
  const headers = { Origin: baseURL! };
  const minimal = { title, format: "UNKNOWN", alternativeTitles: [] };

  async function uiMutation(
    target: Page,
    path: string,
    method: string,
    button: string,
  ) {
    const pending = target.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === path && r.request().method() === method,
      { timeout: 45_000 },
    );
    await target.getByRole("button", { name: button, exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    return response;
  }
  async function search(target: Page) {
    await target.goto("/vi/works");
    await target.getByLabel(publicCopy.vi.search).fill(title);
    const navigation = target.waitForURL(
      (url) =>
        url.pathname === "/vi/works" && url.searchParams.get("q") === title,
      { timeout: 45_000 },
    );
    await target.getByLabel(publicCopy.vi.search).press("Enter");
    await navigation;
    await expect(
      target.getByRole("heading", { name: vi.missing, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
  }
  async function safePage(target: Page) {
    await expect(target.locator("main")).not.toContainText(notes, {
      timeout: 15_000,
    });
    await expect(target.locator("main")).not.toContainText(privateTitle, {
      timeout: 15_000,
    });
    for (const account of accounts)
      await expect(target.locator("main")).not.toContainText(account.email, {
        timeout: 15_000,
      });
    await expect(
      target.getByRole("textbox", { name: vi.notes, exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(
      target.getByRole("heading", { name: vi.history, exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
  }
  async function owned(id: string) {
    const response = await page.request.get(`/api/requests/${id}`);
    expect(response.status()).toBe(200);
    const dto = await response.json();
    expect(dto.kind).toBe("OWNED");
    return dto.request;
  }
  async function overflow(target: Page) {
    expect(
      await target.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }

  try {
    const owner = await signUp(page);
    const reader = await signUp(other);
    await page.setViewportSize({ width: 390, height: 844 });
    await search(page);
    // Prepare only the genuine authorized destination; the missing-story action
    // below still performs the actual client navigation and displays its prefill.
    const newPath = `/vi/requests/new?q=${encodeURIComponent(title)}&format=UNKNOWN`;
    const prepared = await page.request.get(newPath);
    expect(prepared.status()).toBe(200);
    await prepared.body();
    await page.getByRole("link", { name: vi.new, exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/vi/requests/new" &&
        url.searchParams.get("q") === title,
      { timeout: 15_000 },
    );
    await expect(page.getByLabel(vi.title, { exact: true })).toHaveValue(
      title,
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("combobox", { name: vi.format, exact: true }),
    ).toHaveValue("UNKNOWN", { timeout: 15_000 });
    await expect(page.getByText(vi.optional, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const disclaimer = page.getByLabel(vi.disclaimer, { exact: true });
    await expect(disclaimer).not.toBeChecked({ timeout: 15_000 });
    // Native required checkbox validation must block the genuine submit action.
    await page.getByRole("button", { name: vi.submit, exact: true }).click();
    expect(
      await disclaimer.evaluate(
        (element: HTMLInputElement) => element.validity.valueMissing,
      ),
    ).toBe(true);
    await expect(page).toHaveURL(/\/vi\/requests\/new\?/, { timeout: 15_000 });
    await disclaimer.check();
    await overflow(page);
    const detailNavigation = page.waitForResponse(
      (r) =>
        /^\/vi\/requests\/[0-9a-f-]{36}$/.test(new URL(r.url()).pathname) &&
        r.request().method() === "GET",
      { timeout: 45_000 },
    );
    const submitted = await uiMutation(
      page,
      "/api/requests",
      "POST",
      vi.submit,
    );
    expect(submitted.request().postDataJSON().details).toEqual(minimal);
    // Await the real cold-compiled RSC destination before normal 15s UI checks.
    const detailResponse = await detailNavigation;
    expect(detailResponse.status()).toBe(200);
    const id = new URL(detailResponse.url()).pathname.split("/").at(-1)!;
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    createdIds.add(id);
    // Next may replace a prefetched RSC transport; assert its status and the
    // actual destination DOM instead of reading an abandoned CDP resource.
    await expect(page).toHaveURL(new RegExp(`/vi/requests/${id}$`), {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title, {
      timeout: 15_000,
    });
    await expect(page.locator("main > section > p").first()).toHaveText(
      "Đã gửi",
      { timeout: 15_000 },
    );
    // UI transport status/body inputs plus authenticated persisted DTOs avoid
    // CDP response-body reads racing router navigation. No UI response JSON
    // body contract is claimed by these snapshots.
    const created = await owned(id);
    expect(created).toMatchObject({ id, revision: 1, state: "SUBMITTED" });
    expect(created.details).toEqual(minimal);
    await expect(
      page
        .locator("header nav")
        .getByRole("link", { name: vi.mine, exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    // Native locale-root navigation preserves pathname and the selected theme.
    await page
      .getByLabel(dictionary("vi").theme, { exact: true })
      .selectOption("dark");
    const englishLink = page.getByRole("link", {
      name: "Ngôn ngữ: English",
      exact: true,
    });
    await expect(englishLink).toHaveAttribute("href", `/en/requests/${id}`, {
      timeout: 15_000,
    });
    const switched = page.waitForNavigation({ timeout: 45_000 });
    await englishLink.click();
    expect((await switched)?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/en/requests/${id}$`), {
      timeout: 15_000,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "en", {
      timeout: 15_000,
    });
    await expect(
      page.getByLabel(dictionary("en").theme, { exact: true }),
    ).toHaveValue("dark", { timeout: 15_000 });
    await expect(
      page
        .locator("header nav")
        .getByRole("link", { name: en.mine, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const vietnameseLink = page.getByRole("link", {
      name: "Language: Tiếng Việt",
      exact: true,
    });
    await expect(vietnameseLink).toHaveAttribute("href", `/vi/requests/${id}`, {
      timeout: 15_000,
    });
    const switchedBack = page.waitForNavigation({ timeout: 45_000 });
    await vietnameseLink.click();
    expect((await switchedBack)?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/vi/requests/${id}$`), {
      timeout: 15_000,
    });
    await expect(
      page.getByLabel(dictionary("vi").theme, { exact: true }),
    ).toHaveValue("dark", { timeout: 15_000 });
    await overflow(page);
    await expect(page.locator("form details")).not.toHaveAttribute("open");
    await page
      .locator("form summary")
      .filter({ hasText: vi.moreDetails })
      .click();
    await page
      .getByRole("textbox", { name: vi.notes, exact: true })
      .fill(notes);
    await page.getByLabel(vi.disclaimer, { exact: true }).check();
    const amended = await uiMutation(
      page,
      `/api/requests/${id}`,
      "PATCH",
      vi.save,
    );
    expect(amended.request().postDataJSON().revision).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/vi/requests/${id}$`), {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("textbox", { name: vi.notes, exact: true }),
    ).toHaveValue(notes, { timeout: 15_000 });
    const amendedDTO = await owned(id);
    expect(amendedDTO).toMatchObject({ id, revision: 2 });
    expect(amendedDTO.details).toEqual({ ...minimal, notes });

    expect((await other.request.get(`/api/requests/${id}`)).status()).toBe(404);
    await other.goto(`/vi/requests/${id}`);
    await safePage(other);
    await expect(
      other.getByRole("heading", { name: title, exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(other.locator('input[name="title"]')).toHaveCount(0, {
      timeout: 15_000,
    });
    expect([403, 404]).toContain(
      (
        await other.request.patch(`/api/requests/${id}`, {
          headers,
          data: { revision: 2, details: minimal },
        })
      ).status(),
    );
    expect(
      (
        await anonymous.request.post("/api/requests", {
          headers,
          data: { submitKey: randomUUID(), details: minimal },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await page.request.post("/api/requests", {
          headers: { Origin: "https://forged.example.invalid" },
          data: { submitKey: randomUUID(), details: minimal },
        })
      ).status(),
    ).toBe(403);

    // Same title is not identity: different real owner and author produce a
    // distinct private request, not an automatic merge or following relation.
    const secondResponse = await other.request.post("/api/requests", {
      headers,
      data: {
        submitKey: randomUUID(),
        details: { ...minimal, author: `Synthetic different author ${run}` },
      },
    });
    expect(secondResponse.status()).toBe(200);
    const second = await secondResponse.json();
    createdIds.add(second.id);
    expect(second.id).not.toBe(id);
    expect(second.details.author).toBe(`Synthetic different author ${run}`);
    requireTestDatabase();
    const [secondOwner] =
      await sql`select owner_user_id from work_requests where id = ${second.id}`;
    expect(secondOwner?.owner_user_id).toBe(reader.id);
    const missing = randomUUID();
    const unreviewed = await page.request.post(
      `/api/requests/${second.id}/support`,
      { headers, data: { equivalenceAcknowledged: true } },
    );
    const missingSupport = await page.request.post(
      `/api/requests/${missing}/support`,
      { headers, data: { equivalenceAcknowledged: true } },
    );
    expect(unreviewed.status()).toBe(404);
    expect(missingSupport.status()).toBe(404);
    expect(await unreviewed.json()).toEqual(await missingSupport.json());

    requireTestDatabase();
    await sql`update users set role = 'admin' where id = ${owner.id!} and email = ${owner.email} and email_verified = true`;
    const reviewed = await page.request.post(
      `/api/admin/requests/${id}/summary`,
      {
        headers,
        data: {
          revision: (await owned(id)).revision,
          title,
          format: "UNKNOWN",
          alternativeTitles: [`curated alias ${run}`],
          sourceUrl: "https://example.org/synthetic",
          reason: "Synthetic human equivalence review, not production evidence",
          equivalenceReviewAcknowledged: true,
        },
      },
    );
    expect(reviewed.status()).toBe(200);
    expect(await reviewed.json()).toMatchObject({ id, title, revision: 3 });
    await search(other);
    await expect(
      other.getByRole("heading", { name: vi.reviewed, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const summary = other
      .locator("article")
      .filter({ has: other.getByRole("link", { name: title, exact: true }) });
    await expect(
      summary.getByRole("button", { name: vi.follow, exact: true }),
    ).toBeDisabled({ timeout: 15_000 });
    await safePage(other);
    const preparedMine = await other.request.get("/vi/requests");
    expect(preparedMine.status()).toBe(200);
    await preparedMine.body();
    await summary.getByLabel(vi.equivalence, { exact: true }).check();
    const followed = await uiMutation(
      other,
      `/api/requests/${id}/support`,
      "POST",
      vi.follow,
    );
    expect(followed.request().postDataJSON()).toEqual({
      equivalenceAcknowledged: true,
    });
    await expect(other).toHaveURL(/\/vi\/requests$/, { timeout: 15_000 });
    await expect(
      other.getByRole("heading", { name: vi.followed, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const followedSnapshot = await other.request.get(`/api/requests/${id}`);
    expect(followedSnapshot.status()).toBe(200);
    const followedDTO = await followedSnapshot.json();
    expect(followedDTO).toMatchObject({
      kind: "FOLLOWED",
      request: { id, title, revision: 3, following: true, supporterCount: 1 },
    });
    const duplicate = await other.request.post(`/api/requests/${id}/support`, {
      headers,
      data: { equivalenceAcknowledged: true },
    });
    expect(duplicate.status()).toBe(200);
    requireTestDatabase();
    const [supporters] =
      await sql`select count(*)::int as count from work_request_supporters where request_id = ${id} and user_id = ${reader.id!}`;
    expect(supporters?.count).toBe(1);
    await expect(
      other.getByRole("heading", { name: vi.followed, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const followedCard = other
      .locator("article")
      .filter({ has: other.getByRole("link", { name: title, exact: true }) });
    await expect(followedCard).toContainText(`${vi.supporters}: 1`, {
      timeout: 15_000,
    });
    const safeDTO = await (
      await other.request.get(`/api/requests/${id}`)
    ).json();
    expect(safeDTO.kind).toBe("FOLLOWED");
    expect(safeDTO.request).toMatchObject({
      title,
      supporterCount: 1,
      following: true,
    });
    for (const field of [
      "details",
      "events",
      "ownerUserId",
      "email",
      "notes",
      "actorSnapshot",
      "actorUserId",
      "inputHash",
      "submitKey",
      "normalizedTitle",
    ])
      expect(safeDTO.request).not.toHaveProperty(field);
    for (const privateValue of [owner.id!, owner.email, notes])
      expect(JSON.stringify(safeDTO)).not.toContain(privateValue);
    await other.goto(`/vi/requests/${id}`);
    await expect(other.getByRole("heading", { level: 1 })).toHaveText(
      vi.followed,
      { timeout: 15_000 },
    );
    await expect(
      other.getByRole("link", { name: title, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await safePage(other);

    // Reload after summary review: revision 3, not the stale pre-review revision.
    await page.goto(`/vi/requests/${id}`);
    await expect(
      page.getByRole("textbox", { name: vi.notes, exact: true }),
    ).toHaveValue(notes, { timeout: 15_000 });
    await page.getByLabel(vi.title, { exact: true }).fill(privateTitle);
    await page.getByLabel(vi.disclaimer, { exact: true }).check();
    const withdrawal = await uiMutation(
      page,
      `/api/requests/${id}`,
      "PATCH",
      vi.save,
    );
    expect(withdrawal.request().postDataJSON().revision).toBe(3);
    await expect(page).toHaveURL(new RegExp(`/vi/requests/${id}$`), {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      privateTitle,
      { timeout: 15_000 },
    );
    const withdrawalDTO = await owned(id);
    expect(withdrawalDTO).toMatchObject({ id, revision: 4 });
    expect(withdrawalDTO.details).toEqual({
      ...minimal,
      title: privateTitle,
      notes,
    });
    await search(other);
    await expect(
      other.getByRole("heading", { name: vi.reviewed, exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
    await safePage(other);
    await other.goto(`/vi/requests/${id}`);
    await expect(other.locator("article").getByRole("link")).toHaveText(
      vi.unknown,
      { timeout: 15_000 },
    );
    await safePage(other);
    const withdrawnDTO = await (
      await other.request.get(`/api/requests/${id}`)
    ).json();
    expect(withdrawnDTO).toMatchObject({
      kind: "FOLLOWED",
      request: { title: null, format: null },
    });
    expect(JSON.stringify(withdrawnDTO)).not.toContain(notes);
    expect(JSON.stringify(withdrawnDTO)).not.toContain(privateTitle);

    await page.goto(`/vi/requests/${id}`);
    const cancelled = await uiMutation(
      page,
      `/api/requests/${id}/cancel`,
      "POST",
      vi.cancel,
    );
    expect(cancelled.request().postDataJSON()).toEqual({ revision: 4 });
    await expect(page).toHaveURL(/\/vi\/requests$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(vi.mine, {
      timeout: 15_000,
    });
    const cancelledDTO = await owned(id);
    expect(cancelledDTO).toMatchObject({ id, state: "CANCELLED", revision: 5 });
    expect(cancelledDTO.details).toEqual({
      ...minimal,
      title: privateTitle,
      notes,
    });
    await page.goto(`/vi/requests/${id}`);
    await expect(page.locator("main > section > p").first()).toHaveText(
      "Đã hủy",
      { timeout: 15_000 },
    );
    await expect(page.getByLabel(vi.title, { exact: true })).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: vi.cancel, exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
    await overflow(page);
    await other.setViewportSize({ width: 390, height: 844 });
    await other.goto(`/vi/requests/${id}`);
    await expect(other.locator("article").getByRole("link")).toHaveText(
      vi.unknown,
      { timeout: 15_000 },
    );
    await safePage(other);
    await overflow(other);
    const unfollowed = await uiMutation(
      other,
      `/api/requests/${id}/support`,
      "DELETE",
      vi.unfollow,
    );
    expect(unfollowed.request().postDataJSON()).toEqual({});
    await expect(other).toHaveURL(/\/vi\/requests$/, { timeout: 15_000 });
    await expect(other.getByRole("heading", { level: 1 })).toHaveText(vi.mine, {
      timeout: 15_000,
    });
    await expect(
      other.locator(`main a[href="/vi/requests/${id}"]`),
    ).toHaveCount(0, {
      timeout: 15_000,
    });
    // Check the UI DELETE's persisted effect before idempotent API deletions;
    // otherwise those later requests could conceal a failed UI unfollow.
    expect((await other.request.get(`/api/requests/${id}`)).status()).toBe(404);
    requireTestDatabase();
    const [afterUIUnfollow] =
      await sql`select count(*)::int as count from work_request_supporters where request_id = ${id}`;
    expect(afterUIUnfollow?.count).toBe(0);
    for (const requestId of [id, missing]) {
      const response = await other.request.delete(
        `/api/requests/${requestId}/support`,
        { headers },
      );
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ following: false });
    }
    expect((await other.request.get(`/api/requests/${id}`)).status()).toBe(404);
    requireTestDatabase();
    const [remaining] =
      await sql`select count(*)::int as count from work_request_supporters where request_id = ${id}`;
    expect(remaining?.count).toBe(0);
    for (const locale of ["vi", "en"] as const) {
      for (const path of ["", "/new", `/${id}`]) {
        await anonymous.goto(`/${locale}/requests${path}`);
        await expect(
          anonymous.getByText(requestDictionary(locale).signIn, {
            exact: true,
          }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(anonymous.locator('input[name="title"]')).toHaveCount(0, {
          timeout: 15_000,
        });
        await expect(anonymous.locator("main")).not.toContainText(notes, {
          timeout: 15_000,
        });
      }
    }
    const continuationTitle = `Đường đăng nhập ${run}`;
    await anonymous.goto(
      `/en/requests/new?q=${encodeURIComponent(continuationTitle)}&format=UNKNOWN`,
    );
    await anonymous
      .locator("main")
      .getByRole("link", { name: "Sign in", exact: true })
      .click();
    await anonymous.getByLabel("Email address").fill(reader.email);
    await anonymous
      .getByLabel("Password", { exact: true })
      .fill("Synthetic-e2e-password-17!");
    const continuedSignIn = anonymous.waitForResponse(
      (r) =>
        r.url().endsWith("/api/auth/sign-in/email") &&
        r.request().method() === "POST",
      { timeout: 45000 },
    );
    await anonymous
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    expect((await continuedSignIn).status()).toBe(200);
    await expect(anonymous).toHaveURL(/\/en\/requests\/new\?/, {
      timeout: 30000,
    });
    await expect(anonymous.getByLabel(en.title, { exact: true })).toHaveValue(
      continuationTitle,
    );
    await expect(
      anonymous.getByRole("combobox", { name: en.format, exact: true }),
    ).toHaveValue("UNKNOWN");
  } finally {
    await cleanup();
  }
});

for (const locale of ["en", "vi"] as const) {
  test(`A4 progressive request form keyboard, validation and responsive geometry (${locale})`, async ({
    browser,
    page,
    baseURL,
  }) => {
    test.setTimeout(360_000);
    const { run, createdIds, signUp, cleanup } = await requestScenario(
      browser,
      page,
      baseURL,
    );
    const t = requestDictionary(locale);
    const title = `Synthetic progressive request ${run}`;
    const optional = {
      alternativeTitles: `Synthetic alias ${run}`,
      originalTitle: "Synthetic original title",
      author: "Synthetic author",
      sourceUrl: "https://example.org/synthetic-progressive",
      originalLanguage: "en",
      publicationLanguage: "vi",
      publicationYear: "2024",
      description:
        "Synthetic description retained while details are collapsed.",
      additionalEvidence:
        "Synthetic citation context, not fetched by the application.",
      notes: `Synthetic private draft ${run}`,
    };
    const details = {
      title,
      format: "UNKNOWN",
      ...optional,
      alternativeTitles: [optional.alternativeTitles],
      publicationYear: 2024,
    };
    const form = page
      .locator("form")
      .filter({ has: page.locator('input[name="title"]') });
    const disclosure = form.locator("details");
    const summary = disclosure.locator("summary");
    const field = (name: keyof typeof optional) =>
      form.locator(`[name="${name}"]`);
    let mutations = 0;
    page.on("request", (request) => {
      if (
        /^\/api\/requests(?:\/[0-9a-f-]{36})?$/.test(
          new URL(request.url()).pathname,
        ) &&
        ["POST", "PATCH"].includes(request.method())
      )
        mutations++;
    });
    async function outsideDetails(locator: Locator) {
      await expect(locator).toBeVisible();
      expect(
        await locator.evaluate(
          (element) => element.closest("details") === null,
        ),
      ).toBe(true);
    }
    async function retained() {
      await expect(form.getByLabel(t.title, { exact: true })).toHaveValue(
        title,
      );
      for (const [name, value] of Object.entries(optional))
        await expect(field(name as keyof typeof optional)).toHaveValue(value);
      await expect(
        form.getByLabel(t.disclaimer, { exact: true }),
      ).toBeChecked();
    }
    async function layouts() {
      for (const width of [375, 768, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const theme of ["light", "dark"] as const) {
          const selector = page.getByLabel(dictionary(locale).theme, {
            exact: true,
          });
          await selector.selectOption(theme);
          await expect(selector).toHaveValue(theme);
          if (theme === "dark")
            await expect(page.locator("html")).toHaveClass(/dark/);
          else await expect(page.locator("html")).not.toHaveClass(/dark/);
          await progressiveRequestLayout(page, form, width);
          await summary.click();
          await expect(disclosure).not.toHaveAttribute("open");
          await progressiveRequestLayout(page, form, width);
          await summary.click();
          await expect(disclosure).toHaveAttribute("open", "");
        }
      }
    }
    try {
      await signUp(page); // One real verified cookie actor per locale.
      await page.goto(`/${locale}/requests/new`);
      await expect(disclosure).toHaveCount(1);
      expect(
        await form.evaluate((element: HTMLFormElement) => element.noValidate),
      ).toBe(false);
      await expect(summary).toHaveText(t.moreDetails);
      await expect(disclosure).not.toHaveAttribute("open");
      await expect(form.getByLabel(t.title, { exact: true })).toHaveValue("");
      await expect(form.getByLabel(t.format, { exact: true })).toHaveValue(
        "UNKNOWN",
      );
      await outsideDetails(form.getByText(t.basicInformation, { exact: true }));
      await outsideDetails(form.getByLabel(t.title, { exact: true }));
      await outsideDetails(form.getByLabel(t.format, { exact: true }));
      await outsideDetails(form.getByLabel(t.disclaimer, { exact: true }));
      await outsideDetails(
        form.getByRole("button", { name: t.submit, exact: true }),
      );
      for (const name of Object.keys(optional) as (keyof typeof optional)[]) {
        await expect(field(name)).toHaveCount(1);
        await expect(field(name)).toBeEnabled();
        await expect(field(name)).not.toHaveAttribute("required");
        await expect(field(name)).toBeHidden();
        await expect(field(name)).toHaveValue("");
      }
      await form.getByLabel(t.title, { exact: true }).fill(title);
      // Keep the native required acknowledgement and UNKNOWN behavior intact.
      await form.getByRole("button", { name: t.submit, exact: true }).click();
      await expect(
        form.getByLabel(t.disclaimer, { exact: true }),
      ).toBeFocused();
      expect(mutations).toBe(0);
      await form.getByLabel(t.disclaimer, { exact: true }).check();
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(disclosure).toHaveAttribute("open", "");
      await page.keyboard.press("Space");
      await expect(disclosure).not.toHaveAttribute("open");
      await page.keyboard.press("Enter");
      await expect(disclosure).toHaveAttribute("open", "");
      await expect(
        form.getByText(t.privateNotesHelp, { exact: true }),
      ).toBeVisible();
      for (const [name, value] of Object.entries(optional))
        await form
          .getByLabel(t[name as keyof typeof optional], { exact: true })
          .fill(value);
      await summary.focus();
      await page.keyboard.press("Space");
      await expect(disclosure).not.toHaveAttribute("open");
      await retained();
      for (const name of Object.keys(optional) as (keyof typeof optional)[])
        await expect(field(name)).toBeEnabled();
      await page.keyboard.press("Enter");
      await expect(disclosure).toHaveAttribute("open", "");
      await retained();
      await layouts(); // Both disclosure states on the actual create form.
      await page.setViewportSize({ width: 375, height: 900 });

      // Genuine browser validation must reveal the hidden invalid control before
      // its default focus, without disabling native constraints or sending a POST.
      for (const [name, value, validity] of [
        ["sourceUrl", "not a URL", "typeMismatch"],
        ["publicationYear", "10000", "rangeOverflow"],
      ] as const) {
        await field(name).fill(value);
        await summary.click();
        await expect(disclosure).not.toHaveAttribute("open");
        await form.getByRole("button", { name: t.submit, exact: true }).click();
        await expect(disclosure).toHaveAttribute("open", "");
        await expect(field(name)).toBeVisible();
        await expect(field(name)).toBeFocused();
        await outsideDetails(form.getByRole("alert"));
        await expect(form.getByRole("alert")).toContainText(
          t.validationSummary,
        );
        expect(
          await field(name).evaluate(
            (element: HTMLInputElement, key) => element.validity[key],
            validity,
          ),
        ).toBe(true);
        expect(mutations).toBe(0);
        await field(name).fill(optional[name]);
        await retained();
      }

      // These values pass native URL/text constraints but fail the real schema.
      await field("sourceUrl").fill("http://127.0.0.1/private");
      await summary.click();
      await form.getByRole("button", { name: t.submit, exact: true }).click();
      await expect(disclosure).toHaveAttribute("open", "");
      await expect(field("sourceUrl")).toBeVisible();
      await expect(field("sourceUrl")).toBeFocused();
      await expect(field("sourceUrl")).toHaveAttribute("aria-invalid", "true");
      await expect(
        form.getByText(t.sourceUrlError, { exact: true }),
      ).toBeVisible();
      await outsideDetails(form.getByRole("alert"));
      await expect(form.getByRole("alert")).toContainText(t.invalid);
      await progressiveRequestLayout(page, form, 375);
      expect(mutations).toBe(0);
      await expect(field("sourceUrl")).toHaveValue("http://127.0.0.1/private");
      await expect(field("originalLanguage")).toHaveValue(
        optional.originalLanguage,
      );
      await expect(field("notes")).toHaveValue(optional.notes);
      await expect(form.getByLabel(t.title, { exact: true })).toHaveValue(
        title,
      );
      await field("sourceUrl").fill(optional.sourceUrl);
      await field("originalLanguage").fill("not a language");
      await summary.click();
      await expect(disclosure).not.toHaveAttribute("open");
      await form.getByRole("button", { name: t.submit, exact: true }).click();
      await expect(disclosure).toHaveAttribute("open", "");
      await expect(field("originalLanguage")).toBeVisible();
      await expect(field("originalLanguage")).toBeFocused();
      await expect(field("originalLanguage")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(field("originalLanguage")).toHaveValue("not a language");
      await expect(
        form.getByText(t.originalLanguageError, { exact: true }),
      ).toBeVisible();
      await expect(field("notes")).toHaveValue(optional.notes);
      expect(mutations).toBe(0);
      await field("originalLanguage").fill(optional.originalLanguage);
      await retained();
      await summary.click();
      await expect(disclosure).not.toHaveAttribute("open");
      const posted = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/requests" &&
          response.request().method() === "POST",
        { timeout: 45_000 },
      );
      await form.getByRole("button", { name: t.submit, exact: true }).click();
      const post = await posted;
      expect(post.status()).toBe(200);
      expect(post.request().postDataJSON().details).toEqual(details);
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/requests/[0-9a-f-]{36}$`),
        { timeout: 45_000 },
      );
      const id = new URL(page.url()).pathname.split("/").at(-1)!;
      createdIds.add(id);
      const createdResponse = await page.request.get(`/api/requests/${id}`);
      expect(createdResponse.status()).toBe(200);
      expect(await createdResponse.json()).toMatchObject({
        kind: "OWNED",
        request: { id, revision: 1, details },
      });
      // A persisted nonblank optional value initializes the actual edit form open.
      await expect(disclosure).toHaveAttribute("open", "");
      await expect(field("notes")).toHaveValue(optional.notes);
      await outsideDetails(
        form.getByRole("button", { name: t.save, exact: true }),
      );
      await outsideDetails(form.getByLabel(t.disclaimer, { exact: true }));
      await layouts();
      const revisedTitle = `${title} revised`;
      await form.getByLabel(t.title, { exact: true }).fill(revisedTitle);
      await form.getByLabel(t.disclaimer, { exact: true }).check();
      await summary.click();
      await expect(disclosure).not.toHaveAttribute("open");
      const patched = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/requests/${id}` &&
          response.request().method() === "PATCH",
        { timeout: 45_000 },
      );
      await form.getByRole("button", { name: t.save, exact: true }).click();
      const patch = await patched;
      expect(patch.status()).toBe(200);
      expect(patch.request().postDataJSON()).toEqual({
        revision: 1,
        details: { ...details, title: revisedTitle },
      });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        revisedTitle,
        { timeout: 15_000 },
      );
      const amendedResponse = await page.request.get(`/api/requests/${id}`);
      expect(amendedResponse.status()).toBe(200);
      expect(await amendedResponse.json()).toMatchObject({
        kind: "OWNED",
        request: {
          id,
          revision: 2,
          details: { ...details, title: revisedTitle },
        },
      });
      expect(mutations).toBe(2);
    } finally {
      await cleanup();
    }
  });

  test(`A3 My requests real layout, themes and focus order (${locale})`, async ({
    browser,
    page,
    baseURL,
  }) => {
    test.setTimeout(360_000);
    const { sql, run, createdIds, other, signUp, cleanup } =
      await requestScenario(browser, page, baseURL);
    const t = requestDictionary(locale);
    const headers = { Origin: baseURL! };
    const widths = [375, 768, 1280, 1440];
    const themes = ["light", "dark"] as const;
    const englishTitle = `Synthetic journey through the forgotten libraries and distant kingdoms ${"a reader returns with another unwritten story ".repeat(5)}${run}`;
    const vietnameseTitle = `Hành trình hư cấu qua những thư viện xa xôi ${"người đọc tìm lại câu chuyện chưa được kể ".repeat(5)}${run}`;
    const privateTitle = `Synthetic private withdrawn title ${run}`;
    const notes = `Synthetic private layout notes ${run}`;

    async function showMine(width: number, theme: "light" | "dark") {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/requests`);
      const selector = page.getByLabel(dictionary(locale).theme, {
        exact: true,
      });
      await selector.selectOption(theme);
      await expect(selector).toHaveValue(theme);
      if (theme === "dark")
        await expect(page.locator("html")).toHaveClass(/dark/);
      else await expect(page.locator("html")).not.toHaveClass(/dark/);
    }
    async function submit(target: Page, title: string) {
      const response = await target.request.post("/api/requests", {
        headers,
        data: {
          submitKey: randomUUID(),
          details: { title, format: "UNKNOWN", alternativeTitles: [], notes },
        },
      });
      expect(response.status()).toBe(200);
      const request = await response.json();
      createdIds.add(request.id);
      return request;
    }
    async function review(id: string, title: string) {
      const response = await other.request.post(
        `/api/admin/requests/${id}/summary`,
        {
          headers,
          data: {
            revision: 1,
            title,
            format: "UNKNOWN",
            alternativeTitles: [],
            sourceUrl: "https://example.org/synthetic-a3-layout",
            reason: `Synthetic A3 layout equivalence review ${run}`,
            equivalenceReviewAcknowledged: true,
          },
        },
      );
      expect(response.status()).toBe(200);
      const reviewed = await response.json();
      const support = await page.request.post(`/api/requests/${id}/support`, {
        headers,
        data: { equivalenceAcknowledged: true },
      });
      expect(support.status()).toBe(200);
      return reviewed;
    }

    try {
      await signUp(page);
      // Both named sections remain distinct and well-spaced with no rows.
      for (const width of widths) {
        for (const theme of themes) {
          await showMine(width, theme);
          const main = page.getByRole("main");
          for (const name of [t.owned, t.followed]) {
            const region = main.getByRole("region", { name, exact: true });
            await expect(
              region.getByText(t.empty, { exact: true }),
            ).toBeVisible();
            await expect(region.getByRole("listitem")).toHaveCount(0);
          }
          await myRequestsLayout(page, locale, width);
        }
      }

      const reviewer = await signUp(other);
      // Only the original guarded synthetic role-grant pattern; authentication
      // and all requests/summary/follow mutations use real verified cookies.
      requireTestDatabase();
      await sql`update users set role = 'admin' where id = ${reviewer.id!} and email = ${reviewer.email} and email_verified = true`;
      await submit(page, englishTitle);
      await submit(page, vietnameseTitle);
      const publicTitle = `${vietnameseTitle} — public`;
      const publicRequest = await submit(other, publicTitle);
      await review(publicRequest.id, publicTitle);
      const withdrawn = await submit(
        other,
        `Synthetic reviewed summary ${run}`,
      );
      const reviewed = await review(
        withdrawn.id,
        `Synthetic reviewed summary ${run}`,
      );
      const amendment = await other.request.patch(
        `/api/requests/${withdrawn.id}`,
        {
          headers,
          data: {
            revision: reviewed.revision,
            details: {
              title: privateTitle,
              format: "UNKNOWN",
              alternativeTitles: [],
              notes,
            },
          },
        },
      );
      expect(amendment.status()).toBe(200);
      const redacted = await page.request.get(`/api/requests/${withdrawn.id}`);
      expect(redacted.status()).toBe(200);
      const dto = await redacted.json();
      expect(dto).toMatchObject({
        kind: "FOLLOWED",
        request: { title: null, format: null },
      });
      expect(JSON.stringify(dto)).not.toContain(privateTitle);
      expect(JSON.stringify(dto)).not.toContain(notes);

      for (const width of widths) {
        for (const theme of themes) {
          await showMine(width, theme);
          const main = page.getByRole("main");
          const owned = main.getByRole("region", {
            name: t.owned,
            exact: true,
          });
          const followed = main.getByRole("region", {
            name: t.followed,
            exact: true,
          });
          await expect(owned.getByRole("listitem")).toHaveCount(2);
          await expect(followed.getByRole("listitem")).toHaveCount(2);
          const placeholder = followed.getByRole("link", {
            name: t.unknown,
            exact: true,
          });
          await expect(placeholder).toHaveAttribute(
            "href",
            `/${locale}/requests/${withdrawn.id}`,
          );
          await expect(followed).not.toContainText(privateTitle);
          await expect(followed).not.toContainText(notes);
          await expect(
            followed.getByRole("button", { name: t.unfollow, exact: true }),
          ).toHaveCount(2);
          await myRequestsLayout(page, locale, width, [
            englishTitle,
            vietnameseTitle,
            publicTitle,
          ]);
        }
      }

      // Exercise the existing redacted-card action, not just its presence.
      const followed = page
        .getByRole("main")
        .getByRole("region", { name: t.followed, exact: true });
      const card = followed.getByRole("article").filter({
        has: page.getByRole("link", { name: t.unknown, exact: true }),
      });
      const pending = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/requests/${withdrawn.id}/support` &&
          response.request().method() === "DELETE",
      );
      await card.getByRole("button", { name: t.unfollow, exact: true }).click();
      expect((await pending).status()).toBe(200);
      await expect(followed.getByRole("listitem")).toHaveCount(1);
      await expect(
        followed.getByRole("link", { name: t.unknown, exact: true }),
      ).toHaveCount(0);
      expect(
        (await page.request.get(`/api/requests/${withdrawn.id}`)).status(),
      ).toBe(404);
    } finally {
      await cleanup();
    }
  });
}
