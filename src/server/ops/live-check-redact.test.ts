import { describe, expect, it } from "vitest";
import { redact } from "../../../scripts/redact.mjs";

/*
  The Production check's live check (scripts/live-check.mjs) writes to a public log, a public
  summary and a public report.json. Signed in, it opens members' pages, so every identifier is
  taken out of what it writes (CLAUDE.md: counts and anonymous labels only).
*/
describe("the live check's redaction", () => {
  it("takes out player ids in addresses, PUUIDs and other long tokens, and Riot IDs", () => {
    expect(redact("profile: loads signed in (/players/3f2b8c1e-4a5d-4e6f-9a0b-1c2d3e4f5a6b/matches)")).toBe("profile: loads signed in (/players/<id>/matches)");
    expect(redact('{"puuid":"aBcD_eFgH-iJkL0123456789mNoPqRsTuVwXyZ0123456789aBcDeF"}')).toBe('{"puuid":"<token>"}');
    expect(redact("console: Faker#KR1 not found")).toBe("console: <riot-id> not found");
    expect(redact("Ünïcødé Näme#ÖCE1 x")).not.toContain("Näme");
  });

  it("leaves the checks themselves readable", () => {
    for (const line of ["PASS [desktop] team: no sideways scroll  0", "FAIL [security] /players answered 200 (expected a redirect to sign-in)", "team-matches-game-open: no serious or critical axe violation", "deployment 56c4132 · 106 passed, 0 failed, 1 warnings"]) {
      expect(redact(line)).toBe(line);
    }
  });
});
