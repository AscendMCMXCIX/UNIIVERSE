import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/*
  scripts/backup-db.sh (docs/BACKUPS.md): in GitHub Actions the restore check is what proves a
  backup can be used, so a run without its throw-away server (RESTORE_SERVER_URL) fails before it
  reads anything, instead of keeping a backup nobody restored. Locally the check stays optional.
  Nothing here reaches a database: the guard comes first, and the address given is closed.
*/

const script = path.resolve(__dirname, "../../../scripts/backup-db.sh");
const GUARD = "RESTORE_SERVER_URL is not set";

function run(env: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), "backup-guard-"));
  const out = path.join(dir, "out");
  try {
    const r = spawnSync("bash", [script], {
      cwd: dir,
      encoding: "utf8",
      timeout: 30_000,
      env: { PATH: process.env.PATH ?? "", BACKUP_DATABASE_URL: "postgres://nobody@127.0.0.1:1/none", BACKUP_PASSPHRASE: "x".repeat(40), OUT_DIR: out, ...env } as unknown as NodeJS.ProcessEnv,
    });
    return { status: r.status, stderr: r.stderr, wroteOutput: existsSync(out) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("the backup script's restore check", () => {
  it("is required in GitHub Actions: without a restore server the run fails before anything is read or written", () => {
    const r = run({ GITHUB_ACTIONS: "true" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(GUARD);
    expect(r.wroteOutput).toBe(false);
  });

  it("stays optional locally", () => {
    // The run goes on past the guard and fails at its first psql (the closed address), never on the guard.
    expect(run({}).stderr).not.toContain(GUARD);
  });
});

describe("the backup script's restore check covers every table (Release 19)", () => {
  const text = readFileSync(script, "utf8");
  const migrations = readFileSync(path.resolve(__dirname, "../../server/db/migrations.generated.ts"), "utf8");

  it("derives the tables it counts from the database itself, so a table a later migration adds is counted with no edit here", () => {
    expect(text).toMatch(/SELECT 'row:' \|\| c\.relname, .*query_to_xml\(format\('SELECT count\(\*\) AS c FROM public\.%I', c\.relname\)/);
    expect(text).toMatch(/FROM pg_class c JOIN pg_namespace n ON n\.oid = c\.relnamespace WHERE n\.nspname = 'public' AND c\.relkind IN \('r', 'p'\) ORDER BY 1;"/);
    // Every row count is compared, a missing or extra table fails, and the count of tables checked must equal the tables.
    expect(text).toContain('is not in the restored copy');
    expect(text).toContain('the restored copy has tables the source does not');
    expect(text).toContain('[ "$checked" = "$(value "$AFTER" tables)" ]');
    // The manifest keeps every table's count (counts only, no data).
    expect(text).toMatch(/"tableRows": \$\(printf/);
  });

  it("names only the churning tables by hand, each a table the migrations create", () => {
    const churn = /^CHURN="([^"]*)"/m.exec(text)?.[1]?.split(" ") ?? [];
    expect(churn.length).toBeGreaterThan(0);
    for (const table of churn) expect(migrations, table).toMatch(new RegExp(`CREATE TABLE (IF NOT EXISTS )?\\\\?"${table}\\\\?"`));
  });

  it("counts app_settings, the leases' table, as churning (a lease claimed and released while the dump runs is no failure), and still holds its other rows to the range", () => {
    const churn = /^CHURN="([^"]*)"/m.exec(text)?.[1]?.split(" ") ?? [];
    expect(churn).toEqual(expect.arrayContaining(["app_settings", "brand_upload_chunks"]));
    // The rows that are not leases: counted as "settings", range-checked and in the manifest.
    expect(text).toContain("SELECT 'settings', count(*) FROM public.app_settings WHERE key !~ '$LEASES';");
    expect(text).toMatch(/for key in tables [^;]* settings; do/);
    expect(text).toContain('"appSettingsNotLeases": $(value "$AFTER" settings)');
  });

  it("knows every lease key the app writes (src/server/jobs/background.ts), and no ordinary setting as one", () => {
    const leases = new RegExp(/^LEASES='([^']*)'$/m.exec(text)?.[1] ?? "^$");
    const background = readFileSync(path.resolve(__dirname, "../jobs/background.ts"), "utf8");
    const tick = /const LEASE_KEY = "([^"]+)"/.exec(background)?.[1];
    expect(tick).toBeTruthy();
    const helpers = [...background.matchAll(/export const (\w+LeaseKey) = \(\w+: string\) => `([^`$]*)\$\{/g)].map((m) => ({ name: m[1]!, prefix: m[2]! }));
    // Every *LeaseKey helper is here (a new one fails this until the pattern names it).
    expect(helpers.map((h) => h.name).sort()).toEqual([...background.matchAll(/export const (\w+LeaseKey)\b/g)].map((m) => m[1]!).sort());
    expect(helpers.length).toBeGreaterThanOrEqual(3);
    for (const key of [tick!, ...helpers.map((h) => `${h.prefix}00000000-0000-4000-8000-000000000000`)]) expect(leases.test(key), key).toBe(true);
    // What is not a lease keeps the range rule.
    for (const key of ["branding", "tick_lease_note", "ability_range_review", "champion_abilities", "tick-schedule:last-call"]) expect(leases.test(key), key).toBe(false);
  });
});
