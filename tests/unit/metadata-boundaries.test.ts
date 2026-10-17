import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Bounded structural regression, not a whole-repository information-flow proof.
const files = ["metadata-operations.ts", "metadata-operation-safety.ts"];
const allowed = new Set([
  "zod",
  "./contracts",
  "./metadata-operations",
  "@taleatlas/database/catalog-types",
]);
describe("V5A pure dependency boundary", () => {
  it.each(files)(
    "%s has no server/private-store/network import or execution",
    (name) => {
      const path = fileURLToPath(
        new URL(`../../apps/web/src/features/catalog/${name}`, import.meta.url),
      );
      const source = ts.createSourceFile(
        name,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const imports: string[] = [];
      const forbiddenCalls: string[] = [];
      function visit(node: ts.Node) {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
            imports.push(node.moduleSpecifier.text);
        }
        if (ts.isCallExpression(node)) {
          if (node.expression.kind === ts.SyntaxKind.ImportKeyword)
            forbiddenCalls.push("dynamic import");
          if (
            ts.isIdentifier(node.expression) &&
            ["require", "fetch", "eval", "Function"].includes(
              node.expression.text,
            )
          )
            forbiddenCalls.push(node.expression.text);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      expect(imports.length).toBeGreaterThan(0);
      expect(imports.every((value) => allowed.has(value))).toBe(true);
      expect(forbiddenCalls).toEqual([]);
    },
  );
});
