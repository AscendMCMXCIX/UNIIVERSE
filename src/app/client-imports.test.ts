import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
  What the browser downloads. A "use client" module, and every module it imports, goes into the
  JavaScript of each page that uses it. Server-side code never belongs there: the database and
  image libraries cannot run in a browser, and the validation library (zod, about 30 KB compressed)
  only checks what reaches the server. Client code that does need validation (Clash Scout's saved
  draft) loads it with import() when it is needed, which this check allows.

  Followed: static imports and re-exports, through local modules. Not followed: type-only imports
  (removed when compiled), import() (loaded on demand) and "use server" modules (the browser gets
  a reference to the action, not its code).
*/

const SRC = path.join(process.cwd(), "src");
const SERVER_PACKAGES = ["zod", "drizzle-orm", "postgres", "@electric-sql/pglite", "sharp", "tesseract.js", "jose"];

/** Modules in src/server that pages use too, and why each is safe to send to a browser. */
const SHARED: Record<string, string> = {
  "src/server/auth/permissions.ts": "the permission model's names and rules, with no imports: pages use it to show what an account may do, and the server enforces it on every page, action and route",
};

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.(test|d)\.tsx?$/.test(e.name) ? [p] : [];
  });
}

function directive(sf: ts.SourceFile): string | null {
  const first = sf.statements[0];
  return first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) ? first.expression.text : null;
}

/** The modules a file loads when it runs: what it imports or re-exports for its values, not only its types. */
function runtimeImports(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
      const clause = s.importClause;
      const typesOnly =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (!clause.name && clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((e) => e.isTypeOnly)));
      if (!typesOnly) out.push(s.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(s) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)) {
      const typesOnly = s.isTypeOnly || (s.exportClause !== undefined && ts.isNamedExports(s.exportClause) && s.exportClause.elements.every((e) => e.isTypeOnly));
      if (!typesOnly) out.push(s.moduleSpecifier.text);
    }
  }
  return out;
}

function resolveLocal(files: Map<string, ts.SourceFile>, from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : path.resolve(path.dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (files.has(candidate)) return candidate;
  }
  return null; // a stylesheet, JSON or other asset: no imports of its own
}

/** Each way a client module reaches server-side code, as a chain of modules ending in what it should not load. */
export function serverCodeInClient(files: Map<string, ts.SourceFile>): string[] {
  const rel = (f: string) => path.relative(process.cwd(), f);
  const problems: string[] = [];
  for (const [file, sf] of files) {
    if (directive(sf) !== "use client") continue;
    const seen = new Set([file]);
    const queue: string[][] = [[file]];
    while (queue.length) {
      const chain = queue.shift()!;
      const current = files.get(chain[chain.length - 1]!);
      if (!current) continue;
      for (const spec of runtimeImports(current)) {
        if (!spec.startsWith(".") && !spec.startsWith("@/")) {
          if (SERVER_PACKAGES.some((p) => spec === p || spec.startsWith(`${p}/`))) problems.push([...chain.map(rel), spec].join(" → "));
          continue;
        }
        const target = resolveLocal(files, chain[chain.length - 1]!, spec);
        if (!target || seen.has(target)) continue;
        seen.add(target);
        const targetSf = files.get(target);
        if (targetSf && directive(targetSf) === "use server") continue;
        if (target.startsWith(path.join(SRC, "server") + path.sep) && !(rel(target) in SHARED)) {
          problems.push([...chain, target].map(rel).join(" → "));
          continue;
        }
        queue.push([...chain, target]);
      }
    }
  }
  return problems;
}

function parse(file: string, text = fs.readFileSync(file, "utf8")) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

describe("browser code", () => {
  it("never loads server-side code: no database, image or validation library, and from src/server only server actions and the shared modules listed", () => {
    const files = new Map(sourceFiles(SRC).map((f) => [f, parse(f)]));
    expect(serverCodeInClient(files)).toEqual([]);
    expect(Object.keys(SHARED).filter((f) => !files.has(path.join(process.cwd(), f)))).toEqual([]);
  });

  it("is checked through local modules, but not through type-only imports, import() or server actions", () => {
    const at = (name: string) => path.join(SRC, name);
    const files = new Map(
      Object.entries({
        "check/page.tsx": `"use client";\nimport { a } from "./shared";\nimport type { T } from "./typed";\nimport { type U } from "./typed";\nimport { act } from "./actions";\nconst later = () => import("./lazy");`,
        "check/shared.ts": `export { a } from "./schema";`,
        "check/schema.ts": `import { z } from "zod";\nexport const a = z.string();`,
        "check/typed.ts": `import { z } from "zod";\nexport type T = z.infer<typeof s>;\nexport type U = string;\nconst s = z.string();`,
        "check/actions.ts": `"use server";\nimport { z } from "zod";\nexport async function act() {}`,
        "check/lazy.ts": `import { z } from "zod";\nexport const b = z.number();`,
        "check/server.tsx": `"use client";\nimport { db } from "@/server/check/db";`,
        "server/check/db.ts": `export const db = {};`,
      }).map(([name, text]) => [at(name), parse(at(name), text)]),
    );
    expect(serverCodeInClient(files)).toEqual([
      "src/check/page.tsx → src/check/shared.ts → src/check/schema.ts → zod",
      "src/check/server.tsx → src/server/check/db.ts",
    ]);
  });
});
