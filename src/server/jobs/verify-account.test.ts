import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveVerifyPassword, verifyAccountKey, VERIFY_SECRET_MIN_LENGTH, VERIFY_SECRET_UNUSABLE } from "./verify-account";

/*
  The Production check works out the verification account's password itself (production-check.yml,
  the Live check step), with node's HMAC, as the app does, from the key the app names in its answer:
  VERIFY_ACCOUNT_SECRET once the owner has set it, CRON_SECRET until then. If the two drift apart,
  every signed-in check fails to sign in, so this keeps them identical, and runs the step itself with
  a stand-in for the app and for live-check.mjs.
*/

const WORKFLOW = readFileSync(".github/workflows/production-check.yml", "utf8");
const CRON = "a-cron-secret-of-some-length-0123456789";
const OWN = "a-verification-secret-of-its-own-0123456789-abcdefghij";

describe("the verification account's derived password", () => {
  it("is the workflow's derivation: HMAC-SHA256 of the same label, base64url, from the key the app names", () => {
    expect(WORKFLOW).toContain('createHmac("sha256", process.env.VERIFY_KEY).update("uniiverse:production-verification-account:v1", "utf8").digest("base64url")');
    expect(WORKFLOW).toContain('echo "::add-mask::$UNIIVERSE_VERIFY_PASSWORD"');
    expect(WORKFLOW).toContain("export UNIIVERSE_VERIFY_USER=verify UNIIVERSE_VERIFY_PASSWORD");
    expect(WORKFLOW).toContain("VERIFY_ACCOUNT_SECRET: ${{ secrets.VERIFY_ACCOUNT_SECRET }}");
  });

  it("fails the check when the account is lost (withdrawn, conflict, no answer), except by the owner's two off switches", () => {
    // A missing sign-in fails live-check.mjs...
    expect(WORKFLOW).toContain("export LIVE_REQUIRE_SIGN_IN=1");
    // ...except with SIGNED_IN_CHECKS=false or the account deactivated in Admin.
    expect(WORKFLOW).toContain("unset UNIIVERSE_VERIFY_USER UNIIVERSE_VERIFY_PASSWORD LIVE_REQUIRE_SIGN_IN");
    expect(WORKFLOW).toMatch(/deactivated\)\n\s+unset LIVE_REQUIRE_SIGN_IN\n/);
    // Any other answer is a failure, said in the step summary and the production-check issue.
    expect(WORKFLOW).toContain("> verify-account.md");
    expect(WORKFLOW.match(/cat verify-account\.md/g)).toHaveLength(2);
  });

  it("is long, URL-safe, and changes with its key", () => {
    const a = deriveVerifyPassword("secret-one-0123456789");
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(deriveVerifyPassword("secret-one-0123456789")).toBe(a);
    expect(deriveVerifyPassword("secret-two-0123456789")).not.toBe(a);
  });
});

describe("the key the password is worked out from", () => {
  it("is VERIFY_ACCOUNT_SECRET once it is set, CRON_SECRET until then", () => {
    expect(verifyAccountKey({ CRON_SECRET: CRON })).toEqual({ ok: true, name: "CRON_SECRET", key: CRON });
    expect(verifyAccountKey({ CRON_SECRET: CRON, VERIFY_ACCOUNT_SECRET: "" })).toEqual({ ok: true, name: "CRON_SECRET", key: CRON });
    expect(verifyAccountKey({ CRON_SECRET: CRON, VERIFY_ACCOUNT_SECRET: OWN })).toEqual({ ok: true, name: "VERIFY_ACCOUNT_SECRET", key: OWN });
    // It needs no CRON_SECRET of its own (the jobs endpoint does, before this runs).
    expect(verifyAccountKey({ VERIFY_ACCOUNT_SECRET: OWN })).toMatchObject({ ok: true, name: "VERIFY_ACCOUNT_SECRET" });
  });

  it("refuses an unusable VERIFY_ACCOUNT_SECRET instead of falling back to CRON_SECRET, with one sentence for every rule", () => {
    for (const own of ["x".repeat(VERIFY_SECRET_MIN_LENGTH - 1), `${OWN}\n`, ` ${OWN}`, `${OWN} `, `${OWN}\u00a0`, `\ufeff${OWN}`, CRON]) {
      const chosen = verifyAccountKey({ CRON_SECRET: CRON, VERIFY_ACCOUNT_SECRET: own });
      expect(chosen.ok, JSON.stringify(own)).toBe(false);
      // The answer reaches public logs: the same sentence whichever rule failed, naming the
      // setting and its rules, never a value.
      expect(chosen.ok ? "" : chosen.error).toBe(VERIFY_SECRET_UNUSABLE);
      expect(VERIFY_SECRET_UNUSABLE).toMatch(/^VERIFY_ACCOUNT_SECRET /);
      expect(VERIFY_SECRET_UNUSABLE).not.toContain(own.trim());
    }
    expect(verifyAccountKey({ CRON_SECRET: CRON, VERIFY_ACCOUNT_SECRET: "x".repeat(VERIFY_SECRET_MIN_LENGTH) }).ok).toBe(true);
  });

  it("refuses a missing or short CRON_SECRET when there is no VERIFY_ACCOUNT_SECRET", () => {
    for (const env of [{}, { CRON_SECRET: "short" }]) expect(verifyAccountKey(env)).toMatchObject({ ok: false, error: expect.stringMatching(/^CRON_SECRET /) });
  });
});

/** The Live check step's script, exactly as GitHub runs it. */
function liveCheckStep(): string {
  const lines = WORKFLOW.split("\n");
  const step = lines.findIndex((l) => /^\s+- name: Live check \(/.test(l));
  const run = lines.findIndex((l, i) => i > step && /^\s+run: \|$/.test(l));
  expect(step).toBeGreaterThan(-1);
  expect(run).toBeGreaterThan(step);
  const indent = lines[run]!.search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== "" && line.search(/\S/) <= indent) break;
    body.push(line);
  }
  const margin = Math.min(...body.filter((l) => l.trim() !== "").map((l) => l.search(/\S/)));
  return body.map((l) => l.slice(margin)).join("\n");
}

type Step = { status: number | null; out: string; summary: string; curlCalled: boolean; curlArgs: string[]; seen: { user: string | null; password: string | null; required: string | null; cron: string | null; own: string | null } | null };

/**
 * Runs the step with the app's answer `answer` (null: no answer) and the repository's secrets
 * `secrets`. curl answers for the app; live-check.mjs records what it was given.
 */
function runStep(answer: string | null, secrets: Record<string, string>): Step {
  const dir = mkdtempSync(path.join(tmpdir(), "live-check-step-"));
  try {
    const bin = path.join(dir, "bin");
    mkdirSync(bin);
    mkdirSync(path.join(dir, "scripts"));
    writeFileSync(path.join(dir, "answer.json"), answer ?? "");
    writeFileSync(path.join(bin, "curl"), `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${dir}/curl-called"\n${answer === null ? "exit 28" : `cat "${dir}/answer.json"`}\n`);
    chmodSync(path.join(bin, "curl"), 0o755);
    writeFileSync(
      path.join(dir, "scripts", "live-check.mjs"),
      `import { writeFileSync } from "node:fs";\nconst e = process.env;\nwriteFileSync("seen.json", JSON.stringify({ user: e.UNIIVERSE_VERIFY_USER || null, password: e.UNIIVERSE_VERIFY_PASSWORD || null, required: e.LIVE_REQUIRE_SIGN_IN || null, cron: e.CRON_SECRET || null, own: e.VERIFY_ACCOUNT_SECRET || null }));\n`,
    );
    const script = path.join(dir, "step.sh");
    writeFileSync(script, liveCheckStep());
    const output = path.join(dir, "output");
    const summary = path.join(dir, "summary");
    writeFileSync(output, "");
    writeFileSync(summary, "");
    // GitHub runs a step without a named shell as \`bash -e {0}\`.
    const r = spawnSync("bash", ["-e", script], {
      cwd: dir,
      encoding: "utf8",
      timeout: 30_000,
      env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: dir, APP_URL: "https://app.invalid", GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, SIGNED_IN_CHECKS: "true", UNIIVERSE_VERIFY_USER: "", UNIIVERSE_VERIFY_PASSWORD: "", EXPECTED_COMMIT: "", ...secrets } as unknown as NodeJS.ProcessEnv,
    });
    let seen: Step["seen"] = null;
    try {
      seen = JSON.parse(readFileSync(path.join(dir, "seen.json"), "utf8")) as Step["seen"];
    } catch {
      seen = null;
    }
    let curlArgs: string[] = [];
    let curlCalled = false;
    try {
      curlArgs = readFileSync(path.join(dir, "curl-called"), "utf8").split("\n").filter(Boolean);
      curlCalled = true;
    } catch {
      curlCalled = false;
    }
    return { status: r.status, out: `${r.stdout}${r.stderr}`, summary: readFileSync(summary, "utf8"), curlCalled, curlArgs, seen };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const answer = (summary: Record<string, string>, extra: Record<string, unknown> = {}) => JSON.stringify({ ok: true, ...extra, summary: { username: "verify", ...summary }, deployment: {} });

describe("the Live check step signs in with the key the app names", () => {
  it("derives from CRON_SECRET while the app uses it, or answers no key's name (an app from before)", () => {
    for (const reply of [answer({ state: "unchanged", key: "CRON_SECRET" }), answer({ state: "created" }), answer({ state: "password-updated", key: "something else" })]) {
      const r = runStep(reply, { CRON_SECRET: CRON, VERIFY_ACCOUNT_SECRET: OWN });
      expect(r.status, r.out).toBe(0);
      expect(r.seen).toEqual({ user: "verify", password: deriveVerifyPassword(CRON), required: "1", cron: null, own: null });
      expect(r.out).toContain("verification account key: CRON_SECRET");
    }
  });

  it("derives from VERIFY_ACCOUNT_SECRET once the app uses it", () => {
    const r = runStep(answer({ state: "password-updated", key: "VERIFY_ACCOUNT_SECRET" }), { CRON_SECRET: CRON, VERIFY_ACCOUNT_SECRET: OWN });
    expect(r.status, r.out).toBe(0);
    // It asked the app's own job, with the scheduler's secret.
    expect(r.curlArgs).toContain("https://app.invalid/api/jobs/verify-account");
    expect(r.curlArgs).toContain(`Authorization: Bearer ${CRON}`);
    expect(r.seen).toEqual({ user: "verify", password: deriveVerifyPassword(OWN), required: "1", cron: null, own: null });
    expect(r.out).toContain("verification account key: VERIFY_ACCOUNT_SECRET");
    // The secrets never reach the log; the password only in the line that masks it.
    expect(r.out).not.toContain(CRON);
    expect(r.out).not.toContain(OWN);
    expect(r.out.split("\n").filter((l) => l.includes(deriveVerifyPassword(OWN)))).toEqual([`::add-mask::${deriveVerifyPassword(OWN)}`]);
  });

  it("fails, saying so, when the app uses VERIFY_ACCOUNT_SECRET and the repository's copy is missing or padded", () => {
    // The app's own trim(): a no-break space or a byte-order mark counts as padding too.
    for (const own of ["", `${OWN}\n`, ` ${OWN}`, `${OWN}\u00a0`, `\ufeff${OWN}`]) {
      const r = runStep(answer({ state: "unchanged", key: "VERIFY_ACCOUNT_SECRET" }), { CRON_SECRET: CRON, VERIFY_ACCOUNT_SECRET: own });
      expect(r.status, JSON.stringify(own)).toBe(1);
      expect(r.seen).toMatchObject({ user: null, password: null, required: "1" });
      expect(r.out).toContain("::error::The app works the verification account's password out from VERIFY_ACCOUNT_SECRET");
      expect(r.summary).toContain("FAIL: the repository secret VERIFY_ACCOUNT_SECRET");
    }
  });

  it("keeps CRON_SECRET's derivation exactly as it was (no trimming)", () => {
    const padded = `${CRON} `;
    const r = runStep(answer({ state: "unchanged", key: "CRON_SECRET" }), { CRON_SECRET: padded });
    expect(r.status, r.out).toBe(0);
    expect(r.seen?.password).toBe(deriveVerifyPassword(padded));
  });

  it("fails on withdrawn, conflict, a key the server cannot use, or no answer, and shows only the key's own problem", () => {
    const cases: Array<[string | null, string]> = [
      [JSON.stringify({ ok: false, error: 'The account "verify" no longer has only the default member access', summary: { username: "verify", state: "withdrawn", key: "CRON_SECRET" } }), 'answered "withdrawn"'],
      [JSON.stringify({ ok: false, error: "An account named \"verify\" exists that is not the plain member", summary: { username: "verify", state: "conflict" } }), 'answered "conflict"'],
      [JSON.stringify({ ok: false, error: VERIFY_SECRET_UNUSABLE, summary: { username: "verify" } }), `answered "no answer" (${VERIFY_SECRET_UNUSABLE})`],
      [JSON.stringify({ ok: false, error: "CRON_SECRET is not set (or is too short) on this server.", summary: { username: "verify" } }), 'answered "no answer" (CRON_SECRET is not set (or is too short) on this server.)'],
      // The jobs endpoint's own refusals: a wrong scheduler secret (401) and none on the server (503).
      [JSON.stringify({ ok: false, error: "Unauthorised" }), 'answered "no answer" (docs'],
      [JSON.stringify({ ok: false, error: "CRON_SECRET is not configured on the server." }), 'answered "no answer" (CRON_SECRET is not configured on the server.)'],
      [JSON.stringify({ ok: false, error: "Failed query: select something private", summary: { username: "verify" } }), 'answered "no answer" (docs'],
      ["not json", 'answered "no answer" (docs'],
      [null, 'answered "no answer" (docs'],
    ];
    for (const [reply, said] of cases) {
      const r = runStep(reply, { CRON_SECRET: CRON, VERIFY_ACCOUNT_SECRET: OWN });
      expect(r.status, reply ?? "no answer").toBe(1);
      expect(r.seen).toMatchObject({ user: null, password: null, required: "1" });
      expect(r.summary).toContain(said);
      // Other error text never reaches the log or the issue.
      expect(r.out + r.summary).not.toContain("something private");
      expect(r.out + r.summary).not.toContain("no longer has only");
    }
  });

  it("leaves the member pages pending, without failing, by the owner's two off switches", () => {
    const off = runStep(answer({ state: "deactivated", key: "CRON_SECRET" }), { CRON_SECRET: CRON });
    expect(off.status, off.out).toBe(0);
    expect(off.seen).toMatchObject({ user: null, password: null, required: null });
    const switchedOff = runStep(answer({ state: "unchanged" }), { CRON_SECRET: CRON, SIGNED_IN_CHECKS: "false" });
    expect(switchedOff.status).toBe(0);
    expect(switchedOff.curlCalled).toBe(false);
    expect(switchedOff.seen).toMatchObject({ user: null, password: null, required: null });
  });

  it("fails without CRON_SECRET (the sign-in is required and nothing provides it)", () => {
    const r = runStep(answer({ state: "unchanged" }), {});
    expect(r.curlCalled).toBe(false);
    expect(r.seen).toMatchObject({ user: null, password: null, required: "1" });
  });
});
