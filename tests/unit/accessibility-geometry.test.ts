// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { measureAccessibilityGeometry } from "../helpers/accessibility-geometry";

// jsdom has NO real paint. Positive rectangles are deterministic fixture
// contracts for the real sampler, not browser acceptance or layout evidence.
let boxes: Map<Element, DOMRect>;
const box = (left: number, top = 10, width = 20, height = 20) =>
  new DOMRect(left, top, width, height);

function fixture(markup: string) {
  document.body.innerHTML = `<main>${markup}</main>`;
  document.querySelectorAll("*").forEach((el, index) => {
    boxes.set(el, box(100 + index * 40));
  });
}
function element(selector: string) {
  return document.querySelector(selector)!;
}
function place(
  selector: string,
  left: number,
  top = 10,
  width = 20,
  height = 20,
) {
  boxes.set(element(selector), box(left, top, width, height));
}
function included(selector: string) {
  const left = boxes.get(element(selector))!.left;
  return measureAccessibilityGeometry().rects.some(
    (rect) => rect.left === left,
  );
}

beforeEach(() => {
  boxes = new Map();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return boxes.get(this) ?? box(0);
    },
  );
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (
    this: Element,
  ) {
    return (this.hasAttribute("data-no-rect")
      ? []
      : [boxes.get(this) ?? box(0)]) as unknown as DOMRectList;
  });
  // Own computed visibility is explicit, including overrides of hidden ancestors.
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    (el) =>
      ({
        visibility: el.getAttribute("data-visibility") ?? "visible",
      }) as CSSStyleDeclaration,
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("accessibility geometry disclosure eligibility", () => {
  it("keeps the first closed summary but excludes optional input, select and textarea", () => {
    fixture(
      `<details><summary id="summary">Options</summary><input id="input"><select id="select"></select><textarea id="textarea"></textarea></details><button id="submit">Submit</button>`,
    );
    place("#input", 20);
    place("#select", 21);
    place("#textarea", 22);
    place("#submit", 23);
    expect(included("#summary")).toBe(true);
    for (const selector of ["#input", "#select", "#textarea"])
      expect(included(selector)).toBe(false);
    const measured = measureAccessibilityGeometry();
    expect(measured.peerOverlap).toBe(false);
    expect(measured.names).toBe(true);
  });

  it("includes open disclosure descendants", () => {
    fixture(
      `<details open><summary>Options</summary><input id="input" aria-label="Fixture input"><select id="select" aria-label="Fixture select"></select><textarea id="textarea" aria-label="Fixture textarea"></textarea></details>`,
    );
    for (const selector of ["#input", "#select", "#textarea"])
      expect(included(selector)).toBe(true);
    expect(measureAccessibilityGeometry().names).toBe(true);
  });

  it("honors a closed inner disclosure inside an open outer disclosure", () => {
    fixture(
      `<details open><summary>Outer</summary><details><summary id="inner">Inner</summary><input id="input"></details></details>`,
    );
    expect(included("#inner")).toBe(true);
    expect(included("#input")).toBe(false);
  });

  it("keeps only the first summary and its descendants in a closed disclosure", () => {
    fixture(
      `<details><summary id="first"><button id="first-child">First</button></summary><summary id="later"><button id="later-child">Later</button></summary></details>`,
    );
    expect(included("#first")).toBe(true);
    expect(included("#first-child")).toBe(true);
    expect(included("#later")).toBe(false);
    expect(included("#later-child")).toBe(false);
  });

  it("finds the first summary element child after text and another element", () => {
    fixture(
      `<details>Text<div><summary id="nested">Not a direct child</summary></div><summary id="first"><button id="child">Options</button></summary><input id="input"></details>`,
    );
    expect(included("#first")).toBe(true);
    expect(included("#child")).toBe(true);
    expect(included("#nested")).toBe(false);
    expect(included("#input")).toBe(false);
  });

  it("includes ordinary input, select, textarea and button controls", () => {
    fixture(
      `<input id="input" aria-label="Fixture input"><select id="select" aria-label="Fixture select"></select><textarea id="textarea" aria-label="Fixture textarea"></textarea><button id="button">Action</button>`,
    );
    for (const selector of ["#input", "#select", "#textarea", "#button"])
      expect(included(selector)).toBe(true);
    expect(measureAccessibilityGeometry().names).toBe(true);
  });

  it("detects genuine visible peer intersections", () => {
    fixture(`<button id="a">A</button><button id="b">B</button>`);
    place("#a", 10);
    place("#b", 15);
    expect(measureAccessibilityGeometry().peerOverlap).toBe(true);
  });

  it("does not flag separated peers", () => {
    fixture(`<button id="a">A</button><button id="b">B</button>`);
    place("#a", 10);
    place("#b", 40);
    expect(measureAccessibilityGeometry().peerOverlap).toBe(false);
  });

  it("ignores exactly one horizontal pixel of overlap", () => {
    fixture(`<button id="a">A</button><button id="b">B</button>`);
    place("#a", 10);
    place("#b", 29);
    expect(measureAccessibilityGeometry().peerOverlap).toBe(false);
  });

  it("ignores exactly one vertical pixel of overlap", () => {
    fixture(`<button id="a">A</button><button id="b">B</button>`);
    place("#a", 10, 10);
    place("#b", 10, 29);
    expect(measureAccessibilityGeometry().peerOverlap).toBe(false);
  });

  it("flags more than one pixel on each axis", () => {
    fixture(`<button id="a">A</button><button id="b">B</button>`);
    place("#a", 10, 10);
    place("#b", 28.5, 28.5);
    expect(measureAccessibilityGeometry().peerOverlap).toBe(true);
  });

  it("ignores containing control pairs", () => {
    fixture(
      `<details><summary id="a"><button id="b">Action</button></summary></details>`,
    );
    place("#a", 10, 10, 40, 40);
    place("#b", 15, 15);
    expect(measureAccessibilityGeometry().peerOverlap).toBe(false);
  });

  it("retains disabled, inert and pointer-events-none controls and their collisions", () => {
    fixture(
      `<button id="disabled" disabled>Disabled</button><div inert><button id="inert">Inert</button></div><button id="pointer" style="pointer-events:none">Pointer</button>`,
    );
    place("#disabled", 10);
    place("#inert", 11);
    place("#pointer", 12);
    for (const selector of ["#disabled", "#inert", "#pointer"])
      expect(included(selector)).toBe(true);
    expect(measureAccessibilityGeometry().peerOverlap).toBe(true);
  });

  it("retains off-viewport geometry without silently filtering bounds evidence", () => {
    fixture(`<button id="a">A</button><button id="b">B</button>`);
    place("#a", -100, -100);
    place("#b", -99, -99);
    expect(included("#a")).toBe(true);
    expect(included("#b")).toBe(true);
    expect(measureAccessibilityGeometry().peerOverlap).toBe(true);
  });

  it("uses own computed visibility rather than excluding a hidden ancestor override", () => {
    fixture(
      `<div data-visibility="hidden"><button id="visible" data-visibility="visible">Visible override</button><button id="hidden" data-visibility="hidden">Hidden</button></div>`,
    );
    expect(included("#visible")).toBe(true);
    expect(included("#hidden")).toBe(false);
  });

  it("lets a closed outer disclosure override an open inner and its summary", () => {
    fixture(
      `<details><summary id="outer">Outer</summary><details open><summary id="inner">Inner</summary><input id="input"></details></details>`,
    );
    expect(included("#outer")).toBe(true);
    expect(included("#inner")).toBe(false);
    expect(included("#input")).toBe(false);
  });

  it("excludes every descendant when a closed disclosure has no direct summary", () => {
    fixture(
      `<details><div><summary id="nested">Nested only</summary><button id="button">Action</button></div><input id="input"></details>`,
    );
    for (const selector of ["#nested", "#button", "#input"])
      expect(included(selector)).toBe(false);
  });

  it("preserves zero-client-rect and own hidden-visibility exclusions", () => {
    fixture(
      `<button id="zero" data-no-rect>Zero</button><button id="hidden" data-visibility="hidden">Hidden</button><button id="visible">Visible</button><input id="type-hidden" type="hidden">`,
    );
    expect(included("#zero")).toBe(false);
    expect(included("#hidden")).toBe(false);
    expect(included("#type-hidden")).toBe(false);
    expect(included("#visible")).toBe(true);
  });

  it("applies disclosure eligibility to representative roots, cards and labels too", () => {
    fixture(
      `<details><summary>Options</summary><article id="article"></article><div class="settings-card" id="card"></div><label id="label">Suppressed text</label><section id="section"></section></details>`,
    );
    for (const selector of ["#article", "#card", "#label", "#section"])
      expect(included(selector)).toBe(false);
    expect(measureAccessibilityGeometry().labelFragments).toBe(0);
  });

  it("serializes the same sampler without module runtime closures", () => {
    fixture(
      `<details><div></div><summary id="summary">Options</summary><input id="hidden"></details><button id="a">A</button><button id="b">B</button>`,
    );
    place("#hidden", 10);
    place("#a", 20);
    place("#b", 25);
    // Trusted authored code only, compiled afresh with no imported bindings.
    const serialized = new window.Function(
      `return (${measureAccessibilityGeometry.toString()})();`,
    )() as ReturnType<typeof measureAccessibilityGeometry>;
    expect(serialized).toEqual(measureAccessibilityGeometry());
    expect(serialized.peerOverlap).toBe(true);
    expect(serialized.rects.some((rect) => rect.left === 10)).toBe(false);
  });
});

describe("accessibility geometry existing sampling contracts", () => {
  it("retains the 128-control cap and marks excess essentials incomplete", () => {
    fixture(
      Array.from(
        { length: 129 },
        (_, i) => `<button id="b${i}">Action</button>`,
      ).join(""),
    );
    place("#b128", boxes.get(element("#b0"))!.left);
    const measured = measureAccessibilityGeometry();
    expect(measured.complete).toBe(false);
    expect(measured.rects).toHaveLength(129); // 128 essentials plus main.
    expect(measured.peerOverlap).toBe(false); // Excess peer is not sampled.
  });

  it("samples only eight direct section roots and eight representative cards", () => {
    fixture(
      Array.from(
        { length: 9 },
        (_, i) =>
          `<section id="s${i}"></section><article id="a${i}"></article>`,
      ).join(""),
    );
    expect(measureAccessibilityGeometry().rects).toHaveLength(17);
    expect(included("#s7")).toBe(true);
    expect(included("#a7")).toBe(true);
    expect(included("#s8")).toBe(false);
    expect(included("#a8")).toBe(false);
  });

  it("measures actual label text nodes with a scoped Range rectangle fixture", () => {
    fixture(
      `<label id="label" for="input"> Fixture label </label><input id="input">`,
    );
    place("#label", 10, 10, 100, 20);
    const createRange = document.createRange.bind(document);
    vi.spyOn(document, "createRange").mockImplementation(() => {
      const range = createRange();
      Object.defineProperty(range, "getClientRects", {
        value: () => [box(11, 11, 80, 18)],
      });
      return range;
    });
    const measured = measureAccessibilityGeometry();
    expect(measured.labelFragments).toBe(1);
    expect(measured.labelTextFits).toBe(true);
    expect(measured.labelLimit).toBe(false);
    expect(measured.names).toBe(true);
  });

  it("preserves label overflow and the 32-fragment measurement limit", () => {
    fixture(`<label id="label">Fixture label</label>`);
    place("#label", 10);
    const createRange = document.createRange.bind(document);
    let fragments = [box(0)];
    vi.spyOn(document, "createRange").mockImplementation(() => {
      const range = createRange();
      Object.defineProperty(range, "getClientRects", {
        value: () => fragments,
      });
      return range;
    });
    expect(measureAccessibilityGeometry().labelTextFits).toBe(false);
    fragments = Array.from({ length: 33 }, () => box(10));
    expect(measureAccessibilityGeometry().labelLimit).toBe(true);
    expect(measureAccessibilityGeometry().labelFragments).toBe(0);
  });

  it("preserves the 32-child-node label limit", () => {
    fixture(`<label>${"<span></span>".repeat(33)}</label>`);
    expect(measureAccessibilityGeometry().labelLimit).toBe(true);
    expect(measureAccessibilityGeometry().labelFragments).toBe(0);
  });
});
