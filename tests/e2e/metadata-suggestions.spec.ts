import { randomUUID } from "node:crypto";
import { test, expect } from "../helpers/browser-test";
import {
  verifiedBrowserAccount,
  prepareAnonymousAuth,
  deniedMutationBeforeBody,
  type BrowserAccount,
} from "../helpers/verified-browser-account";
import { createDatabase } from "../../packages/database/src/client";
import { requireTestDatabase } from "../helpers/test-database";
import { metadataCopy } from "../../apps/web/src/components/catalog/metadata-suggestion-ui";
import { suggestionCopy } from "../../apps/web/src/components/catalog/suggestion-ui";
import type { SubmitMetadataProposal } from "../../apps/web/src/features/catalog/metadata-operations";

test.describe.configure({ retries: 0 });
for (const locale of ["en", "vi"] as const) {
  test(`${locale}: native single-operation metadata publication, exact retry and private review`, async ({
    browser,
    page,
    baseURL,
  }) => {
    test.setTimeout(360_000);
    expect(baseURL).toBeTruthy();
    const sql = createDatabase(requireTestDatabase()).client;
    const run = randomUUID(),
      source = `Synthetic browser metadata ${run}`;
    const groups = run
      .replaceAll("-", "")
      .slice(0, 20)
      .match(/.{4}/g)!
      .join(":");
    await page
      .context()
      .setExtraHTTPHeaders({ "x-real-ip": `2001:db8:${groups}:1` });
    const adminContext = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "x-real-ip": `2001:db8:${groups}:2` },
    });
    const otherContext = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "x-real-ip": `2001:db8:${groups}:3` },
    });
    const anonContext = await browser.newContext({ baseURL });
    const admin = await adminContext.newPage(),
      other = await otherContext.newPage(),
      anon = await anonContext.newPage();
    const accounts: BrowserAccount[] = [],
      workIds: string[] = [];
    const t = { ...suggestionCopy[locale], ...metadataCopy[locale] };
    try {
      await prepareAnonymousAuth(anon);
      await deniedMutationBeforeBody(
        anon,
        baseURL!,
        `/api/catalog/works/${randomUUID()}/metadata-suggestions`,
      );
      await deniedMutationBeforeBody(
        anon,
        baseURL!,
        `/api/admin/metadata-suggestions/${randomUUID()}/review`,
      );
      await verifiedBrowserAccount(page, baseURL!, run, sql, accounts);
      const reviewer = await verifiedBrowserAccount(
        admin,
        baseURL!,
        run,
        sql,
        accounts,
      );
      const outsider = await verifiedBrowserAccount(
        other,
        baseURL!,
        run,
        sql,
        accounts,
      );
      await sql`update users set role='admin' where id=${reviewer.id!} and email=${reviewer.email} and email_verified=true`;
      const genre = {
        slug: `browser-${run}`,
        nameEn: `Synthetic genre ${run}`,
        nameVi: `Thể loại ${run}`,
      };
      async function seed(withGenre: boolean) {
        const r = await admin.request.post("/api/admin/catalog/works", {
          headers: { Origin: baseURL! },
          data: {
            primaryTitle: `Canonical ${randomUUID()}`,
            primaryTitleLanguage: "en",
            format: "NOVEL",
            visibility: "PUBLISHED",
            releaseStatus: "UNKNOWN",
            publicationReviewAcknowledged: true,
            source: { label: source, citation: "Synthetic browser setup only" },
            titles: [
              { title: `Alias ${run}`, language: "en", kind: "ALIAS" },
              { title: `Secondary ${run}`, language: "fr", kind: "PRIMARY" },
              { title: `Original ${run}`, language: "ja", kind: "ORIGINAL" },
            ],
            descriptions: [
              { language: "en", text: `Untouched summary ${run}` },
              { language: "vi", text: `Mô tả ${run}` },
            ],
            genres: withGenre ? [genre] : [],
          },
        });
        expect(r.status()).toBe(200);
        const w = await r.json();
        workIds.push(w.id);
        return w;
      }
      await seed(true);
      const w = await seed(false);
      const initialTitles =
        await sql`select * from work_titles where work_id=${w.id} order by id`;
      const initialDescriptions =
        await sql`select * from work_descriptions where work_id=${w.id} order by language`;
      const taxonomy = await sql`select * from genres order by slug`;
      let revision = 1,
        addedId = "";
      const added = `Native added ${run}`,
        replaced = `Native replaced ${run}`;
      const types: SubmitMetadataProposal["operation"]["type"][] = [
        "TITLE_ADD",
        "TITLE_REPLACE",
        "TITLE_REMOVE",
        "DESCRIPTION_ADD",
        "DESCRIPTION_REPLACE",
        "DESCRIPTION_REMOVE",
        "GENRE_ADD_MEMBERSHIP",
        "GENRE_REMOVE_MEMBERSHIP",
      ];
      let firstBody: SubmitMetadataProposal | undefined;
      for (const [index, type] of types.entries()) {
        await page.goto(`/${locale}/works/${w.slug}/suggest-metadata`);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          t.heading,
        );
        await page.setViewportSize({ width: 390, height: 844 });
        const operation = page.getByLabel(t.operation, { exact: true });
        await operation.focus();
        await expect(operation).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(operation).not.toBeFocused();
        await operation.selectOption(type);
        await expect(
          page.getByRole("region", { name: t.currentValue }),
        ).toBeVisible();
        if (type === "TITLE_ADD") {
          await page.getByLabel(t.language, { exact: true }).fill("fr");
          await page.getByLabel(t.kind, { exact: true }).selectOption("ALIAS");
          await page.getByLabel(t.title, { exact: true }).fill(added);
        } else if (type.startsWith("TITLE_")) {
          const selector = page.getByLabel(t.target, { exact: true });
          const options = await selector.locator("option").allTextContents();
          expect(options.join(" ")).not.toContain(w.primaryTitle);
          expect(options.join(" ")).not.toContain(`Original ${run}`);
          expect(options.join(" ")).toContain(`Secondary ${run}`);
          await selector.selectOption(addedId);
          await expect(
            page.getByRole("region", { name: t.currentValue }),
          ).toContainText(type === "TITLE_REPLACE" ? added : replaced);
          if (type === "TITLE_REPLACE")
            await page.getByLabel(t.title, { exact: true }).fill(replaced);
        } else if (type.startsWith("DESCRIPTION_")) {
          const language = page.getByLabel(t.language, { exact: true });
          if (type === "DESCRIPTION_ADD") await language.fill("de");
          else await language.selectOption("de");
          if (!type.includes("REMOVE")) {
            await page
              .getByLabel(t.description, { exact: true })
              .fill(`${type} synthetic original ${run}`);
            await page.getByLabel(t.originality, { exact: true }).check();
            await page
              .getByLabel(t.statement, { exact: true })
              .fill(`PRIVATE declaration ${run}`);
          }
        } else {
          if (type === "GENRE_ADD_MEMBERSHIP")
            await page.getByLabel(t.genre, { exact: true }).fill(genre.slug);
          else
            await page
              .getByLabel(t.genre, { exact: true })
              .selectOption(genre.slug);
        }
        if (type.includes("REMOVE"))
          await page
            .getByLabel(t.removeReason, { exact: true })
            .fill("Synthetic deliberate removal");
        await page.getByLabel(t.label, { exact: true }).fill(source);
        await page
          .getByLabel(t.citation, { exact: true })
          .fill(`PRIVATE native citation ${run}`);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        const path = `/api/catalog/works/${w.id}/metadata-suggestions`;
        // Return an unreadable reply after the real server has accepted the first attempt.
        let acceptedId = "";
        if (index === 0)
          await page.route(
            `**${path}`,
            async (route) => {
              firstBody = route.request().postDataJSON();
              const accepted = await route.fetch();
              expect(accepted.status()).toBe(200);
              acceptedId = (await accepted.json()).id;
              await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: "{}",
              });
            },
            { times: 1 },
          );
        const sent = page.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === path &&
            r.request().method() === "POST",
        );
        await page.getByRole("button", { name: t.submit, exact: true }).click();
        const response = await sent;
        expect(response.status()).toBe(200);
        const body = response
          .request()
          .postDataJSON() as SubmitMetadataProposal;
        expect(body).toMatchObject({
          version: 1,
          workId: w.id,
          baseWorkRevision: revision,
          operation: { type },
          citation: { label: source },
        });
        expect(body.submitKey).toMatch(/^[0-9a-f-]{36}$/);
        if (index === 0) {
          await expect(page.getByRole("main").getByRole("alert")).toContainText(
            t.error,
          );
          await expect(operation).toBeDisabled();
          const retried = page.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === path &&
              r.request().method() === "POST",
          );
          await page
            .getByRole("button", { name: t.submit, exact: true })
            .click();
          const retry = await retried;
          expect(retry.status()).toBe(200);
          expect(retry.request().postDataJSON()).toEqual(firstBody);
          expect((await retry.json()).id).toBe(acceptedId);
        }
        await expect(page).toHaveURL(
          new RegExp(`/${locale}/metadata-suggestions/[0-9a-f-]{36}$`),
        );
        const id = new URL(page.url()).pathname.split("/").at(-1)!;
        expect(
          await sql`select * from metadata_edit_suggestions where owner_user_id=${accounts[0].id!} and submit_key=${body.submitKey}`,
        ).toHaveLength(1);
        const before = await anon.request.get(`/api/catalog/works/${w.slug}`);
        expect(before.status()).toBe(200);
        const publicBefore = await before.json();
        if (type === "TITLE_ADD")
          expect(
            publicBefore.titles.some(
              (r: { title: string }) => r.title === added,
            ),
          ).toBe(false);
        if (type === "TITLE_REPLACE")
          expect(
            publicBefore.titles.some(
              (r: { title: string }) => r.title === replaced,
            ),
          ).toBe(false);
        if (type === "DESCRIPTION_ADD")
          expect(
            publicBefore.descriptions.some(
              (r: { language: string }) => r.language === "de",
            ),
          ).toBe(false);
        if (type === "GENRE_ADD_MEMBERSHIP")
          expect(
            publicBefore.genres.some(
              (r: { slug: string }) => r.slug === genre.slug,
            ),
          ).toBe(false);
        expect(
          (await sql`select revision from works where id=${w.id}`)[0].revision,
        ).toBe(revision);
        expect(
          (await anon.request.get(`/api/metadata-suggestions/${id}`)).status(),
        ).toBe(401);
        expect(
          (await other.request.get(`/api/metadata-suggestions/${id}`)).status(),
        ).toBe(404);
        expect(
          (
            await page.request.get(`/api/admin/metadata-suggestions/${id}`)
          ).status(),
        ).toBe(403);
        await sql`update users set role='moderator' where id=${outsider.id!} and email=${outsider.email}`;
        expect(
          (
            await other.request.post(
              `/api/admin/metadata-suggestions/${id}/review`,
              { headers: { Origin: baseURL! }, data: {} },
            )
          ).status(),
        ).toBe(403);
        await sql`update users set role='user' where id=${outsider.id!} and email=${outsider.email}`;
        await admin.goto(`/${locale}/admin/metadata-suggestions/${id}`);
        const article = admin.locator("article");
        await expect(
          article.getByRole("heading", {
            name: t.currentMetadata,
            exact: true,
          }),
        ).toBeVisible();
        await article
          .getByLabel(t.reason, { exact: true })
          .fill(`PRIVATE native review ${run}`);
        for (const label of [t.metadataAck, t.publicationAck, t.rightsAck])
          await article.getByLabel(label, { exact: true }).check();
        const reviewPath = `/api/admin/metadata-suggestions/${id}/review`;
        if (index === 0)
          await admin.route(
            `**${reviewPath}`,
            async (route) => {
              const accepted = await route.fetch();
              expect(accepted.status()).toBe(200);
              await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: "{}",
              });
            },
            { times: 1 },
          );
        const reviewed = admin.waitForResponse(
          (r) =>
            new URL(r.url()).pathname === reviewPath &&
            r.request().method() === "POST",
        );
        await article
          .getByRole("button", { name: t.approve, exact: true })
          .click();
        const outcome = await reviewed;
        expect(outcome.status()).toBe(200);
        expect(outcome.request().postDataJSON()).toEqual({
          version: 1,
          suggestionId: id,
          revision: 1,
          baseWorkRevision: revision,
          decision: "APPROVE",
          reason: `PRIVATE native review ${run}`,
          metadataReviewAcknowledged: true,
          publicationReviewAcknowledged: true,
          rightsReviewAcknowledged: true,
        });
        if (index === 0) {
          await expect(
            admin.getByRole("main").getByRole("alert"),
          ).toContainText(t.uncertainReview);
          await expect(
            article.getByRole("button", { name: t.approve, exact: true }),
          ).toBeDisabled();
          await admin
            .getByRole("button", { name: t.reload, exact: true })
            .click();
        }
        await expect(admin.locator("article")).toContainText(t.approved);
        revision++;
        expect(
          (await sql`select revision from works where id=${w.id}`)[0].revision,
        ).toBe(revision);
        expect(
          await sql`select * from catalog_metadata_evidence where suggestion_id=${id}`,
        ).toHaveLength(1);
        expect([
          ...(await sql`select * from work_titles where work_id=${w.id} and id in ${sql(initialTitles.map((r) => r.id))} order by id`),
        ]).toEqual([...initialTitles]);
        expect([
          ...(await sql`select * from work_descriptions where work_id=${w.id} and language in ('en','vi') order by language`),
        ]).toEqual([...initialDescriptions]);
        if (type === "TITLE_ADD")
          addedId = String(
            (
              await sql`select id from work_titles where work_id=${w.id} and title=${added}`
            )[0].id,
          );
        if (type === "TITLE_REPLACE")
          expect(
            (
              await sql`select id from work_titles where work_id=${w.id} and title=${replaced}`
            )[0].id,
          ).toBe(addedId);
        if (type === "TITLE_REMOVE")
          expect(
            await sql`select id from work_titles where id=${addedId}`,
          ).toHaveLength(0);
        if (type === "DESCRIPTION_ADD" || type === "DESCRIPTION_REPLACE")
          expect(
            (
              await sql`select work_id, language from work_descriptions where work_id=${w.id} and language='de'`
            )[0],
          ).toEqual({ work_id: w.id, language: "de" });
        const published = await anon.request.get(
          `/api/catalog/works/${w.slug}`,
        );
        expect(published.status()).toBe(200);
        const publicAfter = await published.json();
        if (type === "TITLE_ADD" || type === "TITLE_REPLACE")
          expect(
            publicAfter.titles.some(
              (r: { title: string }) =>
                r.title === (type === "TITLE_ADD" ? added : replaced),
            ),
          ).toBe(true);
        if (type === "TITLE_REMOVE")
          expect(
            publicAfter.titles.some(
              (r: { title: string }) => r.title === replaced,
            ),
          ).toBe(false);
        if (type === "DESCRIPTION_ADD" || type === "DESCRIPTION_REPLACE")
          expect(
            publicAfter.descriptions.find(
              (r: { language: string }) => r.language === "de",
            )?.text,
          ).toBe(`${type} synthetic original ${run}`);
        if (type === "DESCRIPTION_REMOVE")
          expect(
            publicAfter.descriptions.some(
              (r: { language: string }) => r.language === "de",
            ),
          ).toBe(false);
        if (type.startsWith("GENRE_"))
          expect(
            publicAfter.genres.some(
              (r: { slug: string }) => r.slug === genre.slug,
            ),
          ).toBe(type === "GENRE_ADD_MEMBERSHIP");
        await anon.goto(`/${locale}/works/${w.slug}`);
        await expect(anon.locator("main")).not.toContainText(
          `PRIVATE native review ${run}`,
        );
        await expect(anon.locator("main")).not.toContainText(
          `PRIVATE declaration ${run}`,
        );
      }
      expect([...(await sql`select * from genres order by slug`)]).toEqual([
        ...taxonomy,
      ]);
      // A stale native proposal remains deliberately rejectable, never auto-rebased.
      const staleBody = {
        version: 1,
        workId: w.id,
        baseWorkRevision: revision,
        submitKey: randomUUID(),
        operation: {
          type: "TITLE_ADD",
          value: { title: `Stale ${run}`, language: "fr", kind: "ALIAS" },
        },
        citation: { label: source, citation: "Synthetic stale case" },
      };
      const stale = await page.request.post(
        `/api/catalog/works/${w.id}/metadata-suggestions`,
        { headers: { Origin: baseURL! }, data: staleBody },
      );
      expect(stale.status()).toBe(200);
      const staleId = (await stale.json()).id;
      // A second real authorized proposal changes the Work; the first is now genuinely stale.
      const competing = await page.request.post(
        `/api/catalog/works/${w.id}/metadata-suggestions`,
        {
          headers: { Origin: baseURL! },
          data: {
            ...staleBody,
            submitKey: randomUUID(),
            operation: {
              type: "TITLE_ADD",
              value: {
                title: `Competing ${run}`,
                language: "fr",
                kind: "ALIAS",
              },
            },
          },
        },
      );
      expect(competing.status()).toBe(200);
      const competitor = await competing.json();
      const competed = await admin.request.post(
        `/api/admin/metadata-suggestions/${competitor.id}/review`,
        {
          headers: { Origin: baseURL! },
          data: {
            version: 1,
            suggestionId: competitor.id,
            revision: 1,
            baseWorkRevision: revision,
            decision: "APPROVE",
            reason: "Synthetic competing revision setup",
            metadataReviewAcknowledged: true,
            publicationReviewAcknowledged: true,
            rightsReviewAcknowledged: true,
          },
        },
      );
      expect(competed.status()).toBe(200);
      await admin.goto(`/${locale}/admin/metadata-suggestions/${staleId}`);
      await expect(
        admin.getByRole("button", { name: t.approve, exact: true }),
      ).toBeDisabled();
      await expect(
        admin.getByRole("button", { name: t.reject, exact: true }),
      ).toBeEnabled();
      await admin
        .getByLabel(t.reason, { exact: true })
        .fill("Stale deliberate rejection");
      const rejection = admin.waitForResponse(
        (r) =>
          new URL(r.url()).pathname ===
            `/api/admin/metadata-suggestions/${staleId}/review` &&
          r.request().method() === "POST",
      );
      await admin.getByRole("button", { name: t.reject, exact: true }).click();
      expect((await rejection).status()).toBe(200);
      await expect(admin.locator("article")).toContainText(t.rejected);
    } finally {
      requireTestDatabase();
      try {
        for (const id of workIds) {
          const hidden =
            await sql`update works set visibility='HIDDEN' where id=${id} and source_id in (select id from catalog_sources where label=${source}) returning id`;
          expect(hidden).toHaveLength(1);
        }
      } finally {
        try {
          for (const account of accounts) {
            await sql`delete from users where email=${account.email}`;
            await sql`delete from verifications where identifier like ${`%${account.email}%`}`;
            if (account.id)
              await sql`delete from rate_limits where key=${`catalog.write:${account.id}`}`;
          }
        } finally {
          await adminContext.close();
          await otherContext.close();
          await anonContext.close();
          await sql.end();
        }
      }
    }
  });
}
