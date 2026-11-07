import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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
