import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sealBuildsProbe, unsealBuildsProbe } from "../../../scripts/builds-probe.mjs";
import { buildsAuditLines, leaderboardAuditLines, runAudits, type JobAnswer } from "../../../scripts/production-audits.mjs";

/*
  The Production check's server-side audits (scripts/production-audits.mjs, Release 19): the
  workflow calls leaderboard-audit and builds-audit before the live check, while it holds
  CRON_SECRET, and passes on counts only, and the builds audit's champions unsealed and masked.
  A job a deployment does not have yet (404) is a warning; any other answer that is not a clean pass
  fails. Nothing but fixed sentences, counts and anonymous labels reaches the log or the summary.
*/

const ROOT = path.resolve(__dirname, "../../..");
const SECRET = "a-made-up-cron-secret-of-enough-length";
const lbOk: JobAnswer = { status: 200, body: { ok: true, summary: { members: 9, active: 7, activeCount: 7, boundaryWithinHour: 0, shown: { scopeCount: 7 }, violations: [], rule: { absentAfter30Days: { checked: 7 }, presentWithinWindow: { checked: 2 } }, returnedRecently: { players: 0, shown: 0, observed: false } } } };

describe("the builds probe", () => {
  it("round-trips two champion ids with the secret, and reads nothing with another secret, cut, or not champion ids", () => {
    const sealed = sealBuildsProbe(["Thresh:solo", "Leona:flex"], SECRET);
    expect(sealed).toMatch(/^v1\.[0-9a-f]{24}\.[0-9a-f~]+\.[0-9a-f]{32}$/);
    expect(sealed).not.toMatch(/Thresh|Leona/);
    expect(unsealBuildsProbe(sealed, SECRET)).toEqual([{ champion: "Thresh", queue: "solo" }, { champion: "Leona", queue: "flex" }]);
    expect(unsealBuildsProbe(sealed, "another-secret")).toBeNull();
    expect(unsealBuildsProbe(sealed.replace(/\.[^.]+\./, ".<token>."), SECRET)).toBeNull();
    expect(unsealBuildsProbe(sealBuildsProbe(["Thresh;rm -rf"], SECRET), SECRET)).toBeNull();
    expect(unsealBuildsProbe(sealBuildsProbe(["Thresh:solo", "Leona"], SECRET), SECRET)).toBeNull();
    expect(unsealBuildsProbe(sealBuildsProbe(["Thresh:solo", "Leona:solo", "Ahri:solo"], SECRET), SECRET)).toBeNull();
    expect(unsealBuildsProbe(null, SECRET)).toBeNull();
  });

  it("holds no run of the 40 token characters the job answer's redaction would replace, for the longest two champions", () => {
    const sealed = sealBuildsProbe(["AurelionSol:clash", "TwistedFate:draft"], SECRET);
    expect(sealed).not.toMatch(/[A-Za-z0-9_-]{40,}/);
    expect(unsealBuildsProbe(sealed, SECRET)).toHaveLength(2);
  });
});

describe("the production audits' lines", () => {
  it("leaderboard-audit: a clean pass gives its counts to the live check; a difference fails with its p-labels; 404 warns", () => {
    expect(leaderboardAuditLines(lbOk)).toMatchObject({ failed: false, env: { LIVE_ACTIVE_PLAYERS: "7", LIVE_LEADERBOARD_BOUNDARY: "0" } });
    expect(leaderboardAuditLines(lbOk).lines[0]).toMatch(/^- ok: leaderboard-audit: 9 members, 7 active, 7 shown; the rule checked at 9 shifted times \(not an observed reappearance\); no return observed/);
    const bad: JobAnswer = { status: 500, body: { ok: false, summary: { ...lbOk.body!.summary, violations: ["p3: shown, but the rule does not show them"] } } };
    const v = leaderboardAuditLines(bad);
    expect(v.failed).toBe(true);
    expect(v.lines.join("\n")).toContain("  - p3: shown, but the rule does not show them");
    expect(leaderboardAuditLines({ status: 404, body: { ok: false } })).toMatchObject({ failed: false, env: {}, warning: expect.stringMatching(/not deployed yet/) });
    expect(leaderboardAuditLines({ status: 503, body: { ok: false } }).failed).toBe(true);
    expect(leaderboardAuditLines({ status: 0, body: null }).failed).toBe(true);
  });

  it("builds-audit: unseals the probe's champions; no probe or an unreadable one is not a failure; violations fail; 404 warns", () => {
    const summary = { candidates: 4, audited: 4, parts: { shown: 28, few: 6, varied: 1 }, violations: [], probeSealed: sealBuildsProbe(["Thresh:solo", "Leona:solo"], SECRET) };
    const ok = buildsAuditLines({ status: 200, body: { ok: true, summary } }, SECRET);
    expect(ok).toMatchObject({ failed: false, ids: [{ champion: "Thresh", queue: "solo" }, { champion: "Leona", queue: "solo" }] });
    expect(ok.lines.join("\n")).not.toMatch(/Thresh|Leona/);
    expect(ok.lines[0]).toMatch(/4 candidate\(s\), 4 audited; parts: 28 shown, 6 few, 1 varied; 0 violation\(s\)/);
    expect(buildsAuditLines({ status: 200, body: { ok: true, summary: { ...summary, probeSealed: undefined } } }, SECRET)).toMatchObject({ failed: false, ids: [] });
    expect(buildsAuditLines({ status: 200, body: { ok: true, summary } }, "another-secret")).toMatchObject({ failed: false, ids: [], warning: expect.stringMatching(/probe/) });
    expect(buildsAuditLines({ status: 500, body: { ok: false, summary: { ...summary, violations: ["c1/MID/core:performer-share"] } } }, SECRET)).toMatchObject({ failed: true, ids: [] });
    expect(buildsAuditLines({ status: 404, body: { ok: false } }, SECRET)).toMatchObject({ failed: false, warning: expect.stringMatching(/not deployed yet/) });
  });

  it("runs both, masks each champion before any other line, writes counts and masked ids only to the environment file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "audits-"));
    try {
      const out: string[] = [];
      const probe = sealBuildsProbe(["Thresh:solo", "Leona:flex"], SECRET);
      const answers: Record<string, JobAnswer["body"]> = { "leaderboard-audit": lbOk.body, "builds-audit": { ok: true, summary: { candidates: 2, audited: 2, violations: [], probeSealed: probe } } };
      const fetchImpl = (async (url: string, init?: RequestInit) => {
        expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
        const job = String(url).split("/api/jobs/")[1]!;
        return new Response(JSON.stringify(answers[job]), { status: 200 });
      }) as unknown as typeof fetch;
      const status = await runAudits({ base: "https://example.invalid", secret: SECRET, summaryFile: path.join(dir, "audits.md"), envFile: path.join(dir, "audits.env"), fetchImpl, log: (l) => out.push(l) });
      expect(status).toBe(0);
      expect(out.slice(0, 2)).toEqual(["::add-mask::Thresh", "::add-mask::Leona"]);
      expect(out.slice(2).join("\n")).not.toMatch(/Thresh|Leona/);
      expect(readFileSync(path.join(dir, "audits.env"), "utf8")).toBe("LIVE_ACTIVE_PLAYERS=7\nLIVE_LEADERBOARD_BOUNDARY=0\nLIVE_BUILDS_CHAMPIONS=Thresh:solo,Leona:flex\n");
      const md = readFileSync(path.join(dir, "audits.md"), "utf8");
      expect(md).toMatch(/^## Production audits\n- ok: leaderboard-audit/);
      expect(md).not.toMatch(/Thresh|Leona|example\.invalid/);
      // Without the secret: nothing is asked, a warning only.
      expect(await runAudits({ base: "https://example.invalid", secret: "", summaryFile: path.join(dir, "a.md"), envFile: path.join(dir, "a.env"), fetchImpl: (() => { throw new Error("asked"); }) as unknown as typeof fetch, log: () => {} })).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is called by the Production check before CRON_SECRET is unset, its environment file read and deleted, its summary in the step and the issue", () => {
    const workflow = readFileSync(path.join(ROOT, ".github/workflows/production-check.yml"), "utf8");
    const call = workflow.indexOf("node scripts/production-audits.mjs");
    expect(call).toBeGreaterThan(0);
    expect(call).toBeLessThan(workflow.indexOf("unset CRON_SECRET VERIFY_ACCOUNT_SECRET"));
    expect(workflow).toContain("set -a; . ./audits.env; set +a; rm -f audits.env");
    expect(workflow).toContain('cat audits.md >> "$GITHUB_STEP_SUMMARY"');
    expect(workflow).toMatch(/grep -q '\^- FAIL' audits\.md/);
    // The two jobs' names as the endpoint knows them.
    const script = readFileSync(path.join(ROOT, "scripts/production-audits.mjs"), "utf8");
    expect(script).toContain('"leaderboard-audit"');
    expect(script).toContain('"builds-audit"');
  });
});
