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

  it("takes out Riot match ids, in an address and anywhere else", () => {
    expect(redact("PASS [games] desktop: the open game is in the address (?match=)  /matches?match=OC1_1234567890")).toBe("PASS [games] desktop: the open game is in the address (?match=)  /matches?match=<match>");
    expect(redact("/players/3f2b8c1e-4a5d-4e6f-9a0b-1c2d3e4f5a6b/matches?match=EUW1_1000000001&view=list")).toBe("/players/<id>/matches?match=<match>&view=list");
    expect(redact('{"open":true,"address":"?match=NA1_1111111111","focus":"together-open"}')).toBe('{"open":true,"address":"?match=<match>","focus":"together-open"}');
    expect(redact("#match-KR_1000000002 > .flex, #together-OC1_1234567890-100")).toBe("#match-<match> > .flex, #together-<match>-100");
    expect(redact("/matches?match=SOMETHING-ELSE")).toBe("/matches?match=<match>");
    expect(JSON.parse(redact(JSON.stringify({ detail: "/matches?match=OC1_1234567890" }))).detail).toBe("/matches?match=<match>");
  });

  it("leaves the checks themselves readable", () => {
    for (const line of ["PASS [desktop] team: no sideways scroll  0", "FAIL [security] /players answered 200 (expected a redirect to sign-in)", "team-matches-game-open: no serious or critical axe violation", "deployment 56c4132 · 106 passed, 0 failed, 1 warnings", "PASS [games] desktop: a copied ?match= link opens that game under its card", "PASS [games] phone: Team Matches's open game is in the address (?match=)", "DEMO_1a2b3c4d_7"]) {
      expect(redact(line)).toBe(line);
    }
  });
});
