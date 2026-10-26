// DOM-only sampler: self-contained for Playwright callback serialization.
export function measureAccessibilityGeometry() {
  const visible = (el: Element) => {
    if (
      el.getClientRects().length === 0 ||
      getComputedStyle(el).visibility === "hidden"
    )
      return false;
    for (
      let ancestor = el.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      if (!ancestor.matches("details:not([open])")) continue;
      // Native disclosure preserves the first summary element child, even when
      // another element precedes it. Every closed ancestor must permit the leaf.
      const summary = Array.from(ancestor.children).find((child) =>
        child.matches("summary"),
      );
      if (!summary?.contains(el)) return false;
    }
    return true;
  };
  const collect = (selector: string) =>
    Array.from(document.querySelectorAll(selector)).filter(visible);
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  };
  const essentials = collect(
    "header nav, header nav a, header nav button, main h1, main label, main input:not([type=hidden]), main select, main textarea, main button, main summary, footer select",
  );
  const controls = collect(
    "main input:not([type=hidden]), main select, main textarea, main button, main summary",
  );
  const labels = collect("main label");
  // Essentials are independent of representative card/root sampling. Hitting
  // this safety cap is a measurement limitation, never an app-layout verdict.
  const complete =
    essentials.length <= 128 && controls.length <= 128 && labels.length <= 128;
  const sampledControls = controls.slice(0, 128);
  let peerOverlap = false;
  for (let i = 0; i < sampledControls.length; i++) {
    for (let j = i + 1; j < sampledControls.length; j++) {
      const a = sampledControls[i]!,
        b = sampledControls[j]!;
      if (a.contains(b) || b.contains(a)) continue;
      const ar = rect(a),
        br = rect(b);
      if (
        Math.min(ar.right, br.right) - Math.max(ar.left, br.left) > 1 &&
        Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top) > 1
      )
        peerOverlap = true;
    }
  }
  let labelTextFits = true,
    labelFragments = 0,
    labelLimit = false;
  for (const label of labels.slice(0, 128)) {
    const box = rect(label);
    const nodes = Array.from(label.childNodes);
    if (nodes.length > 32) {
      labelLimit = true;
      continue;
    }
    for (const node of nodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const text = node.textContent ?? "";
      if (!text.trim()) continue;
      const range = document.createRange();
      range.setStart(node, text.length - text.trimStart().length);
      range.setEnd(node, text.trimEnd().length);
      const fragments = Array.from(range.getClientRects());
      if (fragments.length > 32) {
        labelLimit = true;
        continue;
      }
      for (const fragment of fragments) {
        if (fragment.width <= 0 || fragment.height <= 0) continue;
        labelFragments++;
        if (
          fragment.left < box.left - 1 ||
          fragment.right > box.right + 1 ||
          fragment.top < box.top - 1 ||
          fragment.bottom > box.bottom + 1
        )
          labelTextFits = false;
      }
    }
  }
  return {
    width: document.documentElement.clientWidth,
    scroll: Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
    ),
    complete,
    labelLimit,
    labelFragments,
    labelTextFits,
    peerOverlap,
    // Explicitly representative: first eight visible direct section roots and
    // first eight article/settings cards, not every record or every container.
    rects: [
      ...essentials.slice(0, 128),
      ...collect("main"),
      ...collect("main > section").slice(0, 8),
      ...collect("main article, main .settings-card").slice(0, 8),
    ].map(rect),
    names: sampledControls
      .filter((el) => el.matches("input, select, textarea"))
      .every((el) => {
        const control = el as HTMLInputElement;
        const ids = (control.getAttribute("aria-labelledby") ?? "")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        return Boolean(
          Array.from(control.labels ?? []).some((label) =>
            label.textContent?.trim(),
          ) ||
          control.getAttribute("aria-label")?.trim() ||
          (ids.length > 0 &&
            ids.every((id) =>
              document.getElementById(id)?.textContent?.trim(),
            )),
        );
      }),
  };
}
