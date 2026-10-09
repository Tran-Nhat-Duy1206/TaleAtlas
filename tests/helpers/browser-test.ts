import { test as base, expect, type Request } from "@playwright/test";
export { expect };
export type { Page } from "@playwright/test";
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const started = Date.now();
    const events: string[] = [];
    const errors: string[] = [];
    const statuses = new WeakMap<Request, number>();
    const record = (message: string) =>
      events.push(`${Date.now() - started}ms ${message}`);
    const path = (url: string) => {
      try {
        return new URL(url).pathname;
      } catch {
        return "[unparsed URL]";
      }
    };
    const redact = (text: string) => text.replace(/https?:\/\/\S+/g, "[URL]");
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) record(`document ${path(frame.url())}`);
    });
    page.on("pageerror", (error) => {
      const text = `${error.name}: ${redact(error.message)}`;
      errors.push(text);
      record(`pageerror ${text}`);
    });
    page.on("console", (message) => {
      if (message.text().includes("[Fast Refresh]")) record(message.text());
      if (
        /hydration failed|hydrated.*didn't match|text content does not match/i.test(
          message.text(),
        )
      )
        errors.push(redact(message.text()));
    });
    page.on("response", (response) =>
      statuses.set(response.request(), response.status()),
    );
    page.on("requestfailed", (request) =>
      record(
        `failed ${request.resourceType()} ${path(request.url())}: ${request.failure()?.errorText}`,
      ),
    );
    // Do not await request.response() in an event handler: closing a page can reject it
    // after test teardown, producing an unrelated worker-level unhandled rejection.
    page.on("requestfinished", (request) => {
      if (
        ["document", "script"].includes(request.resourceType()) ||
        path(request.url()).startsWith("/api/")
      )
        record(
          `response ${statuses.get(request)} ${request.resourceType()} ${path(request.url())}`,
        );
    });
    try {
      await use(page);
    } finally {
      await testInfo.attach("navigation-events", {
        body: Buffer.from(events.join("\n")),
        contentType: "text/plain",
      });
      if (testInfo.status === "passed")
        expect(errors, "No runtime or React hydration errors").toEqual([]);
    }
  },
});
