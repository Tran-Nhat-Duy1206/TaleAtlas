"use strict";

const path = require("node:path");
const { globSync: tinyGlobSync, isDynamicPattern } = require("tinyglobby");

// Deliberately NOT a complete fast-glob replacement. Next ESLint 16.4.0's
// get-root-dirs is its sole consumer: globSync(string, { onlyDirectories: true }).
// Re-review this adapter and its coupled regression tests before widening scope.
function globSync(pattern, options) {
  if (
    typeof pattern !== "string" ||
    !pattern ||
    options?.onlyDirectories !== true ||
    Object.keys(options).some((key) => key !== "onlyDirectories")
  ) {
    throw new TypeError("Unsupported Next ESLint root-directory glob call");
  }

  const matches = tinyGlobSync(pattern, {
    onlyDirectories: true,
    // tinyglobby defaults to recursively expanding directory patterns; fast-glob
    // does not. Expansion would incorrectly treat descendants as Next roots.
    expandDirectories: false,
    absolute: path.isAbsolute(pattern),
  });

  // fast-glob retains spelling for literal roots, including './' and trailing '/'.
  if (!isDynamicPattern(pattern)) return matches.length ? [pattern] : [];

  // Brace alternatives of literal directories retain their trailing slash;
  // wildcard/extglob directory matches do not. Next joins these roots with app
  // and pages paths; preserving spelling also makes the baseline explicit.
  const retainTrailingSlash = pattern.endsWith("/") && !/[*?[(]/.test(pattern);
  return matches.map((match) => {
    let root = match.endsWith("/") ? match.slice(0, -1) : match;
    if (pattern.startsWith("./") && !root.startsWith("./")) root = `./${root}`;
    return retainTrailingSlash ? `${root}/` : root;
  });
}

module.exports = { globSync };
