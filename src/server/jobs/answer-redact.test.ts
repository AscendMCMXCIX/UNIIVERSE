import { describe, expect, it } from "vitest";
import { redact } from "../../../scripts/redact.mjs";
import { redactIdentifiers, redactedJson } from "./answer-redact";

/*
  The job endpoint's answer is printed in a public Actions log by every manual Data jobs run, so it
  goes through the same redaction as the Production check's output (scripts/redact.mjs). The two
  copies of the rules must give the same result: the check's script runs under plain Node, the
  endpoint inside the app, so neither can import the other. Every identifier here is made up.
*/
const PUUID = "A1b2".repeat(19) + "Cd"; // 78 characters, the length of a PUUID
const SAMPLES = [
  "match OC1_1234567890 failed: Rate limited",
  "OC1_1234567890: Riot answered 429 on /lol/match/v5/matches/OC1_1234567890",
  `account-sync: /lol/match/v5/matches/by-puuid/${PUUID}/ids answered 503`,
  "Example Player#TEST could not be found",
  "open /players/3f2b8c1e-4a5d-4e6f-9a0b-1c2d3e4f5a6b/matches?match=NA1_1234567890&tab=games",
  '{"ok":true,"summary":{"state":"unchanged","databaseMb":156,"logs":["kept 12 of 12 accounts"]},"deployment":{"commit":"2f4ae30","region":"syd1"}}',
];

describe("the job endpoint's redaction", () => {
  it("gives the same result as the Production check's (scripts/redact.mjs)", () => {
    for (const sample of SAMPLES) expect(redactIdentifiers(sample)).toBe(redact(sample));
  });

  it("takes out match ids, PUUIDs, Riot IDs and ids, and keeps counts, states and job names", () => {
    expect(redactIdentifiers(SAMPLES[0]!)).toBe("match <match> failed: Rate limited");
    expect(redactIdentifiers(SAMPLES[1]!)).toBe("<match>: Riot answered 429 on /lol/match/v5/matches/<match>");
    expect(redactIdentifiers(SAMPLES[2]!)).toBe("account-sync: /lol/match/v5/matches/by-puuid/<token>/ids answered 503");
    expect(redactIdentifiers(SAMPLES[3]!)).toBe("<riot-id> could not be found");
    expect(redactIdentifiers(SAMPLES[4]!)).toBe("open /players/<id>/matches?match=<match>&tab=games");
    expect(redactIdentifiers(SAMPLES[5]!)).toBe(SAMPLES[5]);
  });

  it("answers valid JSON with the status asked for", async () => {
    const res = redactedJson({ ok: false, key: "figures-backfill", summary: { logs: ["OC1_1234567890: timeout"] } }, 500);
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ ok: false, key: "figures-backfill", summary: { logs: ["<match>: timeout"] } });
  });
});
