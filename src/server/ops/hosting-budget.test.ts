import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/*
  Hosting-usage safeguards that are easy to undo by accident:
  - Vercel builds production, and a preview only when one is asked for (each preview stores another
    full copy of the app's functions); production is not rebuilt for tests or tooling alone;
  - a build with a DATABASE_URL leaves PGlite (the demo database, about 19 MB per function) out.
  (In src/, so pnpm verify and CI's unit job run it; in tests/ops only `pnpm test` ran it, never CI.)
*/

const root = path.resolve(__dirname, "../../..");
const ignore = (env: Record<string, string>) => spawnSync("bash", [path.join(root, "scripts/vercel-ignore-build.sh")], { cwd: root, env: { PATH: process.env.PATH ?? "", ...env } as unknown as NodeJS.ProcessEnv }).status;

describe("Vercel ignored build step", () => {
  it("skips previews nobody asked for", () => {
    expect(ignore({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature-x", VERCEL_GIT_COMMIT_MESSAGE: "Fix a bug" })).toBe(0);
  });
  it("builds a preview for a preview/ branch or [preview] in the commit message", () => {
    expect(ignore({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/new-card" })).toBe(1);
    expect(ignore({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feature-x", VERCEL_GIT_COMMIT_MESSAGE: "Try the card [preview]" })).toBe(1);
  });
  it("builds production when it cannot tell what changed", () => {
    expect(ignore({ VERCEL_ENV: "production" })).toBe(1);
  });
  // A production deployment costs Vercel Active CPU (cold starts, and the Production check runs
  // against it): a merge of tests or tooling alone does not deploy (docs/HOSTING_USAGE.md).
  const appFiles = (names: string[]) =>
    spawnSync("bash", [path.join(root, "scripts/vercel-ignore-build.sh"), "--app-files"], { cwd: root, input: names.join("\n") + "\n", env: { PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv }).stdout.toString().split("\n").filter(Boolean);
  it("does not deploy for tests, test runners, scripts, docs or repository settings", () => {
    expect(appFiles(["e2e/team.spec.ts", "e2e/players.ts", "tests/db/rank-watch.test.ts", "tests/ops/hosting-budget.test.ts", "src/proxy.test.ts", "src/components/ui/tab-bar.test.tsx", "playwright.config.ts", "vitest.config.ts", "scripts/live-check.mjs", "scripts/backup-db.sh", "docs/HOSTING_USAGE.md", "STATUS.md", ".github/workflows/ci.yml", ".githooks/pre-push", ".claude/settings.json", ".env.example"])).toEqual([]);
  });
  it("deploys for anything the app is built from or serves", () => {
    const app = ["src/proxy.ts", "src/app/(app)/layout.tsx", "src/lib/prefetch-mark.ts", "public/riot.txt", "drizzle/0066_example.sql", "package.json", "pnpm-lock.yaml", "next.config.ts", "postcss.config.mjs", "tsconfig.json", "vercel.json", "src/server/db/migrations.generated.ts"];
    expect(appFiles(app)).toEqual(app);
  });
});

describe("Next.js output tracing", () => {
  const load = async (databaseUrl: string | undefined) => {
    const before = process.env.DATABASE_URL;
    if (databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = databaseUrl;
    try {
      const { vi } = await import("vitest");
      vi.resetModules();
      return (await import("../../../next.config")).default;
    } finally {
      if (before === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = before;
    }
  };
  it("leaves PGlite out of builds that connect to Postgres", async () => {
    const config = await load("postgres://user:pass@db.example:6543/postgres");
    expect(JSON.stringify(config.outputFileTracingExcludes)).toContain("pglite");
  });
  it("keeps PGlite for the demo and the browser tests (no DATABASE_URL)", async () => {
    const config = await load(undefined);
    expect(JSON.stringify(config.outputFileTracingExcludes ?? {})).not.toContain("pglite");
  });
  it("leaves sharp's musl build out of every build (Vercel's servers use glibc)", async () => {
    for (const url of [undefined, "postgres://user:pass@db.example:6543/postgres"]) {
      const excludes = JSON.stringify((await load(url)).outputFileTracingExcludes);
      expect(excludes).toContain("@img+sharp-libvips-linuxmusl-");
      expect(excludes).not.toMatch(/sharp-libvips-linux-x64|sharp-linux-x64/);
    }
  });
  it("loads PGlite and its drizzle driver only when a PGlite database is opened", () => {
    // A top-level import would load PGlite in every Postgres deployment, where it is left out: the
    // functions would fail to start. (drizzle-orm/pglite imports PGlite itself.)
    const source = readFileSync(path.join(root, "src/server/db/create.ts"), "utf8");
    expect(source).not.toMatch(/^import[^;]*from "(@electric-sql\/pglite|drizzle-orm\/pglite)"/m);
    expect(source).toContain('import("@electric-sql/pglite")');
    expect(source).toContain('import("drizzle-orm/pglite")');
  });
});
