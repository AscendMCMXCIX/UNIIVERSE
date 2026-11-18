import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  // A batch of merges deploys once: a production commit that a later commit on its branch already
  // holds is skipped (that later commit deploys next). Run in a throw-away clone of a local "remote".
  describe("a batch of merges", () => {
    const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const setup = () => {
      const dir = mkdtempSync(path.join(tmpdir(), "vercel-ignore-"));
      const remote = path.join(dir, "remote.git");
      const clone = path.join(dir, "clone");
      git(dir, "init", "--quiet", "--bare", "--initial-branch=main", remote);
      git(dir, "clone", "--quiet", remote, clone);
      const commit = (name: string) => {
        writeFileSync(path.join(clone, `${name}.ts`), `export const ${name} = 1;\n`);
        git(clone, "add", ".");
        git(clone, "commit", "--quiet", "-m", name);
        return git(clone, "rev-parse", "HEAD");
      };
      return { dir, remote, clone, commit };
    };
    const run = (clone: string, env: Record<string, string>) =>
      spawnSync("bash", [path.join(root, "scripts/vercel-ignore-build.sh")], { cwd: clone, env: { PATH: process.env.PATH ?? "", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", ...env } as unknown as NodeJS.ProcessEnv }).status;

    it("skips a commit that a later one on its branch holds, and builds the later one", () => {
      const { dir, remote, clone, commit } = setup();
      try {
        const first = commit("a");
        const second = commit("b");
        const last = commit("c");
        git(clone, "push", "--quiet", "origin", "main");
        git(clone, "checkout", "--quiet", second);
        expect(run(clone, { VERCEL_IGNORE_REMOTE: remote, VERCEL_GIT_COMMIT_SHA: second, VERCEL_GIT_PREVIOUS_SHA: first })).toBe(0);
        git(clone, "checkout", "--quiet", last);
        expect(run(clone, { VERCEL_IGNORE_REMOTE: remote, VERCEL_GIT_COMMIT_SHA: last, VERCEL_GIT_PREVIOUS_SHA: first })).toBe(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("builds when the branch's tip does not hold the commit, or the remote does not answer", () => {
      const { dir, remote, clone, commit } = setup();
      try {
        const first = commit("a");
        const kept = commit("b");
        git(clone, "push", "--quiet", "origin", "main");
        // The branch is rewritten: its tip no longer holds `kept`.
        git(clone, "checkout", "--quiet", first);
        git(clone, "checkout", "--quiet", "-B", "main");
        commit("other");
        git(clone, "push", "--quiet", "--force", "origin", "main");
        git(clone, "checkout", "--quiet", kept);
        expect(run(clone, { VERCEL_IGNORE_REMOTE: remote, VERCEL_GIT_COMMIT_SHA: kept, VERCEL_GIT_PREVIOUS_SHA: first })).toBe(1);
        expect(run(clone, { VERCEL_IGNORE_REMOTE: path.join(dir, "missing.git"), VERCEL_GIT_COMMIT_SHA: first, VERCEL_GIT_PREVIOUS_SHA: first })).toBe(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("never skips a preview this way, and needs the commit and its branch", () => {
      const { dir, remote, clone, commit } = setup();
      try {
        const first = commit("a");
        commit("b");
        git(clone, "push", "--quiet", "origin", "main");
        git(clone, "checkout", "--quiet", first);
        // A requested preview builds whatever the branch's tip is.
        expect(run(clone, { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/x", VERCEL_IGNORE_REMOTE: remote, VERCEL_GIT_COMMIT_SHA: first })).toBe(1);
        // Without the commit's SHA, production cannot tell, so it builds.
        expect(run(clone, { VERCEL_IGNORE_REMOTE: remote })).toBe(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
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
