import fs from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/*
  What the browser downloads. A "use client" module, and every module it imports, goes into the
  JavaScript of the pages that use it, at once or (through import()) when it is needed. So from
  client code:
  - server-only code is never reachable, at once or later: Node's built-in modules, the database,
    image and session libraries (SERVER_ONLY), and modules in src/server other than server actions
    and the shared modules listed in SHARED;
  - large libraries the browser does run (HEAVY) load only through import(), when they are
    needed, except from the modules listed with their reason.

  Followed: imports and re-exports, through local modules, and import() calls. Not followed:
  type-only imports (removed when compiled) and "use server" modules (the browser gets a
  reference to the action, not its code).
*/

const SRC = path.resolve(__dirname, "..");
const ROOT = path.resolve(SRC, "..");

/** Packages that only run on the server. */
const SERVER_ONLY = ["drizzle-orm", "postgres", "@electric-sql/pglite", "sharp", "jose", ...builtinModules.filter((m) => !m.startsWith("_"))];

/** Large libraries the browser may run, but only when it needs them: package → why it is large. */
const HEAVY: Record<string, string> = {
  zod: "the validation library behind the server's checks (about 30 KB compressed)",
  "tesseract.js": "Clash Scout's text recognition engine, with its worker and language data",
};

/** Modules allowed to import a HEAVY package directly, and why. */
const HEAVY_ALLOWED: Record<string, string> = {
  "src/domain/clash-scout/schema.ts": "Clash Scout checks the draft kept in this browser before showing it, synchronously, so a draft is never lost to a download that fails (#112 review)",
};

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

interface Edge {
  spec: string;
  lazy: boolean;
}

/** The modules a file loads when it runs (imported or re-exported for their values), and those it loads later with import(). */
function runtimeImports(sf: ts.SourceFile): Edge[] {
  const out: Edge[] = [];
  for (const s of sf.statements) {
    if (ts.isImportDeclaration(s) && ts.isStringLiteral(s.moduleSpecifier)) {
      const clause = s.importClause;
      const typesOnly =
        clause !== undefined &&
        (clause.isTypeOnly ||
          (!clause.name && clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every((e) => e.isTypeOnly)));
      if (!typesOnly) out.push({ spec: s.moduleSpecifier.text, lazy: false });
    } else if (ts.isExportDeclaration(s) && s.moduleSpecifier && ts.isStringLiteral(s.moduleSpecifier)) {
      const typesOnly = s.isTypeOnly || (s.exportClause !== undefined && ts.isNamedExports(s.exportClause) && s.exportClause.elements.length > 0 && s.exportClause.elements.every((e) => e.isTypeOnly));
      if (!typesOnly) out.push({ spec: s.moduleSpecifier.text, lazy: false });
    }
  }
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) out.push({ spec: n.arguments[0].text, lazy: true });
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function resolveLocal(files: Map<string, ts.SourceFile>, from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : path.resolve(path.dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (files.has(candidate)) return candidate;
  }
  return null; // a stylesheet, JSON or other asset: no imports of its own
}

const packageOf = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!).replace(/^node:/, "");

/** Each way client code reaches what it should not, as a chain of modules ("⇢" marks an import()). */
export function serverCodeInClient(files: Map<string, ts.SourceFile>): string[] {
  const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
  const problems = new Set<string>();
  for (const [file, sf] of files) {
    if (directive(sf) !== "use client") continue;
    const seen = new Set([file]);
    const queue: Array<{ chain: string[]; arrows: string[] }> = [{ chain: [file], arrows: [] }];
    while (queue.length) {
      const { chain, arrows } = queue.shift()!;
      const here = chain[chain.length - 1]!;
      const current = files.get(here);
      if (!current) continue;
      const show = (last: string, lazy: boolean) => chain.map((f, i) => `${rel(f)}${i < chain.length - 1 ? ` ${arrows[i]} ` : ""}`).join("") + ` ${lazy ? "⇢" : "→"} ${last}`;
      for (const { spec, lazy } of runtimeImports(current)) {
        if (!spec.startsWith(".") && !spec.startsWith("@/")) {
          const pkg = packageOf(spec);
          if (SERVER_ONLY.includes(pkg)) problems.add(show(spec, lazy));
          else if (pkg in HEAVY && !lazy && !(rel(here) in HEAVY_ALLOWED)) problems.add(show(spec, lazy));
          continue;
        }
        const target = resolveLocal(files, here, spec);
        if (!target || seen.has(target)) continue;
        const targetSf = files.get(target);
        if (targetSf && directive(targetSf) === "use server") continue;
        if (target.startsWith(path.join(SRC, "server") + path.sep) && !(rel(target) in SHARED)) {
          problems.add(show(rel(target), lazy));
          continue;
        }
        seen.add(target);
        queue.push({ chain: [...chain, target], arrows: [...arrows, lazy ? "⇢" : "→"] });
      }
    }
  }
  return [...problems];
}

function parse(file: string, text = fs.readFileSync(file, "utf8")) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

describe("browser code", () => {
  it("never reaches server-only code, and loads large libraries only when they are needed", () => {
    const files = new Map(sourceFiles(SRC).map((f) => [f, parse(f)]));
    expect(serverCodeInClient(files)).toEqual([]);
    // Each listed exception still exists.
    expect([...Object.keys(SHARED), ...Object.keys(HEAVY_ALLOWED)].filter((f) => !files.has(path.join(ROOT, f)))).toEqual([]);
  });

  it("is checked through local modules and import(), but not through type-only imports or server actions", () => {
    const at = (name: string) => path.join(SRC, name);
    const files = new Map(
      Object.entries({
        "check/page.tsx": `"use client";\nimport { a } from "./shared";\nimport type { T } from "./typed";\nimport { type U } from "./typed";\nimport { act } from "./actions";\nexport { } from "./side";\nconst later = () => import("./lazy");\nconst ocr = () => import("tesseract.js");`,
        "check/shared.ts": `export { a } from "./schema";`,
        "check/schema.ts": `import { z } from "zod";\nexport const a = z.string();`,
        "check/typed.ts": `import { z } from "zod";\nexport type T = z.infer<typeof s>;\nexport type U = string;\nconst s = z.string();`,
        "check/actions.ts": `"use server";\nimport { z } from "zod";\nexport async function act() {}`,
        "check/side.ts": `import { readFileSync } from "node:fs";`,
        "check/lazy.ts": `import { db } from "@/server/check/db";`,
        "check/server.tsx": `"use client";\nimport { db } from "@/server/check/db";\nimport sharp from "sharp";\nimport crypto from "crypto";`,
        "server/check/db.ts": `export const db = {};`,
      }).map(([name, text]) => [at(name), parse(at(name), text)]),
    );
    expect(serverCodeInClient(files).sort()).toEqual(
      [
        "src/check/page.tsx → src/check/shared.ts → src/check/schema.ts → zod",
        "src/check/page.tsx → src/check/side.ts → node:fs",
        "src/check/page.tsx ⇢ src/check/lazy.ts → src/server/check/db.ts",
        "src/check/server.tsx → src/server/check/db.ts",
        "src/check/server.tsx → sharp",
        "src/check/server.tsx → crypto",
      ].sort(),
    );
  });
});
