import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Static source contracts, not browser geometry, loaded-font or contrast/WCAG
// certification. No mocked session here constitutes backend authorization proof.
const root = new URL("../../", import.meta.url);
const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const globalCss = source("apps/web/src/app/globals.css");
const catalogCss = source("apps/web/src/components/catalog/catalog.module.css");
const libraryCss = source("apps/web/src/components/library/library.module.css");
const parse = (text: string) =>
  ts.createSourceFile(
    "contract.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
const library = parse(source("apps/web/src/app/[locale]/library/page.tsx"));
const request = parse(
  source("apps/web/src/app/[locale]/requests/new/page.tsx"),
);
const discovery = parse(
  source("apps/web/src/components/catalog/Discovery.tsx"),
);

const clean = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "");
const compact = (text: string) => text.replace(/\s+/g, " ").trim();
type Rule = {
  selector: string;
  declarations: Record<string, string>;
  context: string[];
};
// Walk brace blocks so an exact base selector cannot accidentally match a
// descendant selector or a same-named rule nested in a media query.
function rules(css: string): Rule[] {
  const result: Rule[] = [];
  function blocks(text: string, context: string[]) {
    let start = 0;
    while (start < text.length) {
      const open = text.indexOf("{", start);
      if (open < 0) break;
      const header = compact(text.slice(start, open).replace(/^[\s\S]*;/, ""));
      let depth = 1;
      let end = open + 1;
      while (end < text.length && depth) {
        if (text[end] === "{") depth++;
        if (text[end] === "}") depth--;
        end++;
      }
      if (depth) throw new Error(`Unclosed CSS block: ${header}`);
      const body = text.slice(open + 1, end - 1);
      if (header.startsWith("@")) blocks(body, [...context, header]);
      else {
        if (body.includes("{"))
          throw new Error(`Unexpected nested style: ${header}`);
        const declarations: Record<string, string> = {};
        for (const entry of body.split(";")) {
          const colon = entry.indexOf(":");
          if (colon < 0) continue;
          const property = entry.slice(0, colon).trim();
          if (property in declarations)
            throw new Error(`Duplicate ${property} in ${header}`);
          declarations[property] = compact(entry.slice(colon + 1));
        }
        result.push({ selector: header, declarations, context });
      }
      start = end;
    }
  }
  blocks(clean(css), []);
  return result;
}
function rule(css: string, selector: string, context: string[] = []) {
  const matches = rules(css).filter(
    (item) =>
      item.selector === selector &&
      JSON.stringify(item.context) === JSON.stringify(context),
  );
  expect(
    matches,
    `exact selector ${selector} in ${context.join(" / ") || "base"}`,
  ).toHaveLength(1);
  return matches[0]!.declarations;
}
function nodes<T extends ts.Node>(
  node: ts.Node,
  predicate: (node: ts.Node) => node is T,
): T[] {
  const found: T[] = [];
  const visit = (child: ts.Node) => {
    if (predicate(child)) found.push(child);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}
function elements(node: ts.Node, tag: string) {
  return nodes(node, ts.isJsxElement).filter(
    (item) => item.openingElement.tagName.getText() === tag,
  );
}
function attribute(element: ts.JsxElement, name: string) {
  return element.openingElement.attributes.properties.find(
    (item): item is ts.JsxAttribute =>
      ts.isJsxAttribute(item) && item.name.getText() === name,
  )?.initializer;
}
// Compare syntax trees, not formatting or entire source-file snapshots.
function shape(node: ts.Node): unknown {
  if (ts.isStringLiteral(node)) return [node.kind, node.text];
  if (ts.isJsxText(node)) return [node.kind, compact(node.text)];
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => {
    if (!ts.isJsxText(child) || compact(child.text))
      children.push(shape(child));
  });
  return children.length
    ? [node.kind, children]
    : [node.kind, compact(node.getText())];
}
function expression(text: string) {
  const file = parse(`const value = (${text});`);
  const declaration = nodes(file, ts.isVariableDeclaration)[0]!;
  return (declaration.initializer as ts.ParenthesizedExpression).expression;
}
function same(node: ts.Node | undefined, expected: string) {
  expect(node).toBeDefined();
  expect(shape(node!)).toEqual(shape(expression(expected)));
}
function jsxExpressions(node: ts.Node) {
  return nodes(node, ts.isJsxExpression).flatMap((item) =>
    item.expression ? [item.expression] : [],
  );
}
function containsExpressions(file: ts.SourceFile, expected: string[]) {
  const actual = jsxExpressions(file).map(shape);
  for (const value of expected)
    expect(actual).toContainEqual(shape(expression(value)));
}
const genericHover = ".button:hover:not(:disabled)";
const primaryHover = ".button.primary:hover:not(:disabled)";
const catalogHover = ".catalog .button:hover:not(:disabled)";
// These fixed selectors have no IDs, type selectors, :is or selector lists.
// :not contributes its argument (:disabled), not an extra pseudo-class.
function stateSpecificity(selector: string) {
  expect(selector).toMatch(/^\.[\w.-]+(?: \.[\w-]+)?:hover:not\(:disabled\)$/);
  return (selector.match(/\.[\w-]+/g) ?? []).length + 2;
}

describe("design consistency: static CSS contracts", () => {
  it("preserves the light palette", () => {
    expect(rule(globalCss, ":root")).toEqual({
      "--paper": "#f7f5ed",
      "--surface": "#fffdf6",
      "--ink": "#242b24",
      "--muted": "#626a5f",
      "--green": "#234b39",
      "--green-ink": "#f7f5ed",
      "--line": "#d9dccf",
      "--wash": "#e8ecdd",
      "--error": "#9b3430",
      "--error-bg": "#f9e9e5",
      "color-scheme": "light",
    });
  });
  it("preserves the dark palette", () => {
    expect(rule(globalCss, ".dark")).toEqual({
      "--paper": "#171e19",
      "--surface": "#1d2720",
      "--ink": "#eeeede",
      "--muted": "#a8b3a4",
      "--green": "#bdd4aa",
      "--green-ink": "#17251b",
      "--line": "#39473a",
      "--wash": "#25382a",
      "--error": "#ffb4a8",
      "--error-bg": "#3b2827",
      "color-scheme": "dark",
    });
  });
  it("keeps the primary normal green pair", () => {
    expect(rule(globalCss, ".button.primary")).toEqual({
      background: "var(--green)",
      "border-color": "var(--green)",
      color: "var(--green-ink)",
    });
  });
  it("explicitly retains the primary pair on enabled hover", () => {
    expect(rule(globalCss, primaryHover)).toMatchObject({
      background: "var(--green)",
      color: "var(--green-ink)",
    });
    expect(stateSpecificity(primaryHover)).toBeGreaterThan(
      stateSpecificity(genericHover),
    );
  });
  it("does not change secondary button surfaces or generic hover", () => {
    expect(rule(globalCss, ".button")).toEqual({
      display: "inline-flex",
      "align-items": "center",
      "justify-content": "center",
      gap: "20px",
      border: "1px solid var(--line)",
      "border-radius": "4px",
      padding: "12px 20px",
      background: "var(--surface)",
      color: "var(--ink)",
      "font-size": "13px",
      "font-weight": "600",
      "min-height": "46px",
      transition: "background 0.15s, transform 0.15s",
    });
    expect(rule(globalCss, genericHover)).toEqual({
      transform: "translateY(-1px)",
      background: "var(--wash)",
    });
  });
  it("preserves danger, disabled and keyboard-focus declarations", () => {
    expect(rule(globalCss, ".danger-button")).toEqual({
      color: "var(--error)",
      "border-color": "var(--error)",
    });
    expect(rule(globalCss, "button:disabled, select:disabled")).toEqual({
      cursor: "wait",
      opacity: "0.65",
    });
    expect(rule(globalCss, ":focus-visible")).toEqual({
      outline: "3px solid var(--green)",
      "outline-offset": "4px",
    });
  });
  it("uses green-ink for catalog native buttons", () => {
    expect(rule(catalogCss, ".button")).toMatchObject({
      background: "var(--green)",
      color: "var(--green-ink)",
    });
  });
  it("uses green-ink for catalog button links rather than paper", () => {
    expect(rule(catalogCss, ".catalog a.button")).toEqual({
      color: "var(--green-ink)",
    });
  });
  it("scopes an enabled catalog hover pair that wins regardless of file order", () => {
    expect(rule(catalogCss, catalogHover)).toMatchObject({
      background: "var(--green)",
      color: "var(--green-ink)",
    });
    expect(stateSpecificity(catalogHover)).toBeGreaterThan(
      stateSpecificity(genericHover),
    );
    expect(
      rule(catalogCss, ".catalog :is(a, button, input, select):focus-visible"),
    ).toEqual({ outline: "3px solid var(--green)", "outline-offset": "4px" });
    expect(rule(catalogCss, ".filters select:disabled")).toEqual({
      cursor: "not-allowed",
      opacity: "1",
      "border-style": "dashed",
    });
  });
  it("defines only the five opt-in page-title declarations", () => {
    expect(rule(globalCss, ".page-title")).toEqual({
      "font-size": "clamp(1.75rem, 4vw, 2.25rem)",
      "line-height": "1.25",
      margin: "0 0 1rem",
      "letter-spacing": "-0.025em",
      "overflow-wrap": "anywhere",
    });
    expect(
      rules(globalCss).filter((item) => item.selector.includes(".page-title")),
    ).toHaveLength(1);
  });
  it("preserves bare headings and the Vietnamese serif fallback", () => {
    expect(rule(globalCss, "h1, h2, h3, p")).toEqual({ "margin-top": "0" });
    expect(rule(globalCss, "h1, h2, h3")).toEqual({
      "font-family": 'Georgia, "Times New Roman", serif',
      "font-weight": "400",
      "line-height": "1.13",
      "letter-spacing": "-1.2px",
    });
    expect(rule(globalCss, 'html[lang="vi"] :is(h1, h2, h3)')).toEqual({
      "font-family": '"Times New Roman", Cambria, serif',
    });
    expect(
      rules(globalCss).filter((item) => item.selector === "h1"),
    ).toHaveLength(0);
  });
  it("preserves reduced-motion overrides", () => {
    const context = ["@media (prefers-reduced-motion: reduce)"];
    expect(rule(globalCss, "html", context)).toEqual({
      "scroll-behavior": "auto",
    });
    expect(rule(globalCss, "*, *::before, *::after", context)).toEqual({
      transition: "none !important",
    });
  });
  it("changes exactly the two library surface borders to line tokens", () => {
    const borders = rules(libraryCss).filter(
      (item) => "border" in item.declarations,
    );
    expect(borders.map((item) => item.selector)).toEqual([".card", ".widget"]);
    expect(rule(libraryCss, ".card")).toEqual({
      padding: "1.25rem",
      border: "1px solid var(--line)",
      "border-radius": "0.75rem",
    });
    expect(rule(libraryCss, ".widget")).toEqual({
      "margin-block": "1rem",
      padding: "1rem",
      border: "1px solid var(--line)",
      "border-radius": "0.75rem",
    });
    expect(clean(libraryCss)).not.toMatch(
      /var\(--border|box-shadow|background\s*:/,
    );
  });
  it("preserves library filter and list layout", () => {
    expect(rule(libraryCss, ".library")).toEqual({
      "max-width": "68rem",
      margin: "2rem auto",
      padding: "1rem",
      "overflow-wrap": "anywhere",
    });
    expect(rule(libraryCss, ".controls")).toEqual({
      display: "flex",
      "flex-wrap": "wrap",
      gap: "1rem",
      "align-items": "end",
      "margin-block": "1.5rem",
    });
    expect(rule(libraryCss, "form.controls")).toEqual({
      "flex-direction": "row",
    });
    expect(rule(libraryCss, ".list")).toEqual({
      "list-style": "none",
      padding: "0",
      display: "grid",
      gap: "1rem",
    });
  });
});

describe("design consistency: source AST contracts", () => {
  it("opts all three Library branch headings into page-title without changing text", () => {
    const headings = elements(library, "h1");
    expect(headings).toHaveLength(3);
    for (const heading of headings)
      same(heading, '<h1 className="page-title">{t.title}</h1>');
  });
  it("opts Request New into page-title while retaining its locale expression", () => {
    const headings = elements(request, "h1");
    expect(headings).toHaveLength(1);
    same(
      headings[0],
      '<h1 className="page-title">{requestDictionary(locale).new}</h1>',
    );
  });
  it("opts Discovery into page-title while retaining its recent/releases choice", () => {
    const headings = elements(discovery, "h1");
    expect(headings).toHaveLength(1);
    same(
      headings[0],
      '<h1 className="page-title">{recent ? d.recent : d.releases}</h1>',
    );
  });
  it("keeps page-title opt-in classes exclusively on the five intended h1 nodes", () => {
    const uses = [library, request, discovery].flatMap((file) =>
      nodes(file, ts.isJsxAttribute).filter(
        (item) =>
          item.name.getText() === "className" &&
          item.initializer &&
          ts.isStringLiteral(item.initializer) &&
          item.initializer.text.split(/\s+/).includes("page-title"),
      ),
    );
    expect(uses).toHaveLength(5);
    for (const use of uses)
      expect(
        (use.parent.parent as ts.JsxOpeningElement).tagName.getText(),
      ).toBe("h1");
  });
  it("keeps Apply a native primary button inside the native GET filter form", () => {
    const forms = elements(library, "form");
    expect(forms).toHaveLength(1);
    const buttons = elements(forms[0]!, "button");
    expect(buttons).toHaveLength(1);
    same(buttons[0], '<button className="button primary">{t.apply}</button>');
    const form = forms[0]!;
    expect((attribute(form, "method") as ts.StringLiteral).text).toBe("get");
    same(
      (attribute(form, "action") as ts.JsxExpression).expression,
      "`/${locale}/library`",
    );
    same(
      (attribute(form, "key") as ts.JsxExpression).expression,
      'JSON.stringify([locale, query.status ?? "", query.favorite ?? "", query.sort])',
    );
    expect(
      form.openingElement.attributes.properties.map((item) =>
        ts.isJsxAttribute(item) ? item.name.getText() : "spread",
      ),
    ).toEqual(["key", "action", "method", "className"]);
  });
  it("preserves filter names, defaults, options and localized labels as AST", () => {
    const labels = elements(elements(library, "form")[0]!, "label");
    expect(labels).toHaveLength(3);
    const expected = [
      '<label>{t.status}<select name="status" defaultValue={query.status ?? ""}><option value="">{t.all}</option>{statuses.map((value) => (<option key={value} value={value}>{t.labels[value]}</option>))}</select></label>',
      '<label>{t.favorite}<select name="favorite" defaultValue={query.favorite === undefined ? "" : String(query.favorite)}><option value="">{t.all}</option><option value="true">{t.yes}</option><option value="false">{t.no}</option></select></label>',
      '<label>{t.sort}<select name="sort" defaultValue={query.sort}><option value="UPDATED_DESC">{t.updated}</option><option value="ADDED_DESC">{t.added}</option><option value="TITLE_ASC">{t.alphabetical}</option><option value="RATING_DESC">{t.rating}</option></select></label>',
    ];
    labels.forEach((label, index) => same(label, expected[index]!));
    expect(elements(library, "input")).toHaveLength(0);
    expect(
      elements(library, "form")[0]!
        .children.filter(ts.isJsxElement)
        .map((item) => item.openingElement.tagName.getText()),
    ).toEqual(["label", "label", "label", "button", "a"]);
  });
  it("preserves native reset navigation and server query serialization", () => {
    const form = elements(library, "form")[0]!;
    same(
      elements(form, "a")[0],
      "<a href={`/${locale}/library`}>{t.reset}</a>",
    );
    const variables = nodes(library, ts.isVariableDeclaration);
    for (const [name, value] of Object.entries({
      suffix: "new URLSearchParams()",
      destination: '`/${locale}/library${suffix.size ? `?${suffix}` : ""}`',
      query: "libraryPageQuery(raw, locale)",
      input:
        "{ page: query.page, locale, status: query.status, favorite: query.favorite, sort: query.sort }",
    })) {
      same(
        variables.find((item) => item.name.getText() === name)?.initializer,
        value,
      );
    }
    const loop = nodes(library, ts.isForOfStatement)[0]!;
    const reference = nodes(
      parse(
        'for (const [key, value] of Object.entries(raw)) if (typeof value === "string") suffix.set(key, value);',
      ),
      ts.isForOfStatement,
    )[0]!;
    expect(shape(loop)).toEqual(shape(reference));
  });
  it("preserves Library access-error copy references and alert semantics", () => {
    const alerts = elements(library, "p").filter(
      (item) =>
        (attribute(item, "role") as ts.StringLiteral | undefined)?.text ===
        "alert",
    );
    expect(alerts.map(shape)).toEqual(
      ["accessUnconfirmed", "invalid", "loadError"].map((name) =>
        shape(expression(`<p role="alert">{t.${name}}</p>`)),
      ),
    );
    containsExpressions(library, [
      "t.accessGuidance",
      "t.retryLoad",
      "t.private",
    ]);
  });
  it("preserves Library empty-state expressions and recovery copy", () => {
    const heading = elements(library, "h2").find(
      (item) =>
        (attribute(item, "id") as ts.StringLiteral | undefined)?.text ===
        "library-empty-heading",
    );
    same(
      heading,
      '<h2 id="library-empty-heading">{emptyPage ? t.emptyPage : restrictive ? t.empty : t.emptyLibrary}</h2>',
    );
    containsExpressions(library, [
      "!emptyPage && !restrictive && <p>{t.emptyLibraryText}</p>",
      "t.firstPage",
      "t.showFullLibrary",
      "t.browseCatalog",
    ]);
    const variables = nodes(library, ts.isVariableDeclaration);
    same(
      variables.find((item) => item.name.getText() === "restrictive")
        ?.initializer,
      "query.status !== undefined || query.favorite !== undefined",
    );
    same(
      variables.find((item) => item.name.getText() === "emptyPage")
        ?.initializer,
      "result !== null && result.total > 0 && result.items.length === 0",
    );
  });
  it("imports catalog styles and applies only the catalog root section class", () => {
    const imports = nodes(discovery, ts.isImportDeclaration).filter(
      (item) =>
        ts.isStringLiteral(item.moduleSpecifier) &&
        item.moduleSpecifier.text === "./catalog.module.css",
    );
    expect(imports).toHaveLength(1);
    expect(imports[0]!.importClause?.name?.text).toBe("styles");
    const sections = elements(discovery, "section");
    expect(sections).toHaveLength(1);
    same(
      (attribute(sections[0]!, "className") as ts.JsxExpression | undefined)
        ?.expression,
      "styles.catalog",
    );
    expect(sections[0]!.openingElement.attributes.properties).toHaveLength(1);
    expect(
      nodes(discovery, ts.isJsxAttribute).filter(
        (item) => item.name.getText() === "className",
      ),
    ).toHaveLength(2);
  });
  it("retains Discovery server data selection without client logic", () => {
    expect(
      discovery.statements.some(
        (item) =>
          ts.isExpressionStatement(item) &&
          ts.isStringLiteral(item.expression) &&
          item.expression.text === "use client",
      ),
    ).toBe(false);
    const variables = nodes(discovery, ts.isVariableDeclaration);
    expect(variables.map((item) => item.name.getText())).toEqual([
      "d",
      "result",
      "path",
    ]);
    same(variables[0]!.initializer, "discoveryCopy[locale]");
    same(variables[1]!.initializer, "recent ?? releases!");
    same(variables[2]!.initializer, 'recent ? "recently-added" : "releases"');
    expect(
      nodes(discovery, ts.isCallExpression).map((item) =>
        item.expression.getText(),
      ),
    ).toEqual([
      "recent?.items.map",
      "addedAt.slice",
      "releases?.items.map",
      "verifiedAt.slice",
    ]);
  });
  it("preserves Discovery child order, notes and empty-state AST", () => {
    const children = elements(discovery, "section")[0]!.children.filter(
      (item) => !ts.isJsxText(item) || compact(item.text),
    );
    expect(
      children.map((item) =>
        ts.isJsxElement(item)
          ? item.openingElement.tagName.getText()
          : "expression",
      ),
    ).toEqual([
      "h1",
      "p",
      "nav",
      "expression",
      "expression",
      "expression",
      "nav",
    ]);
    same(children[1], "<p>{recent ? d.recentNote : d.releaseNote}</p>");
    same(
      (children[3] as ts.JsxExpression).expression,
      "!result.items.length && <p>{d.empty}</p>",
    );
  });
  it("preserves Discovery navigation labels, destinations and pagination conditions", () => {
    const navs = elements(discovery, "nav");
    expect(navs).toHaveLength(2);
    same(
      navs[0],
      '<nav aria-label={locale === "vi" ? "Khám phá" : "Discovery"}><Link href={`/${locale}/recently-added`}>{d.recent}</Link>{" · "}<Link href={`/${locale}/releases`}>{d.releases}</Link>{" · "}<Link href={`/${locale}/works`}>{locale === "vi" ? "Danh mục" : "Catalog"}</Link></nav>',
    );
    same(
      navs[1],
      '<nav aria-label={locale === "vi" ? "Phân trang" : "Pagination"}>{result.page > 1 && (<Link href={`/${locale}/${path}?page=${result.page - 1}`}>{d.previous}</Link>)}{" "}{result.page * result.pageSize < result.total && (<Link href={`/${locale}/${path}?page=${result.page + 1}`}>{d.next}</Link>)}</nav>',
    );
  });
  it("preserves Discovery recent and verified-release item render trees", () => {
    const maps = nodes(discovery, ts.isCallExpression).filter((item) =>
      item.expression.getText().endsWith(".map"),
    );
    expect(maps).toHaveLength(2);
    same(
      maps[0],
      'recent?.items.map(({ work, addedAt }) => (<div key={work.id} data-testid="recent-work"><WorkCard work={work} locale={locale} /><time dateTime={addedAt}>{addedAt.slice(0, 10)}</time></div>))',
    );
    same(
      maps[1],
      'releases?.items.map(({ id, work, releaseDate, language, label, source, verifiedAt }) => (<article key={id} data-testid="verified-release"><WorkCard work={work} locale={locale} /><h3>{label}</h3><dl><dt>{d.date}</dt><dd><time dateTime={releaseDate}>{releaseDate}</time></dd><dt>{d.language}</dt><dd>{language}</dd><dt>{d.source}</dt><dd>{source.label}: {source.citation}{source.url && (<>{" · "}<a href={source.url} rel="nofollow noopener noreferrer">{d.source}</a></>)}</dd><dt>{d.verified}</dt><dd><time dateTime={verifiedAt}>{verifiedAt.slice(0, 10)}</time></dd></dl></article>))',
    );
  });
});
