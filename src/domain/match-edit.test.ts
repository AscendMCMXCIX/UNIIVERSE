import { describe, expect, it } from "vitest";
import { buildMatchPatch, formFromMatch, pendingEdits, shownValue, withEdit, type EditableMatch, type MatchEdits } from "./match-edit";

/*
  D1: the match editor never sends what the person did not touch. These tests replay the browser
  sequences: the server's record changes underneath (a Riot game linked, its result fetched) while
  the person edits other fields, and the save carries only their own edits.
*/

const TZ = "Australia/Sydney";
const base: EditableMatch = {
  result: null,
  durationSeconds: null,
  riotMatchId: null,
  notes: "",
  vodUrl: "",
  playedAt: "2026-10-15T09:15:00.000Z",
  eventName: "",
  opponentName: "",
  enemyPlayers: {},
  mode: "ranked-flex",
};

describe("match editor edits", () => {
  it("a link that arrives after loading shows up, and saving notes does not send the Riot ID", () => {
    let edits: MatchEdits = {};
    edits = withEdit(edits, formFromMatch(base, TZ), "notes", "Lost lane early.");
    // The suggestion is linked; the page refreshes with the server's new record.
    const linked: EditableMatch = { ...base, riotMatchId: "OC1_9000000001" };
    const server = formFromMatch(linked, TZ);
    const pending = pendingEdits(edits, server);
    expect(shownValue(pending, server, "riotMatchId")).toBe("OC1_9000000001");
    expect(buildMatchPatch(pending, linked, TZ)).toEqual({ notes: "Lost lane early." });
  });

  it("before the refresh lands, the save still carries only the edited fields (never a blank Riot ID)", () => {
    const edits = withEdit({}, formFromMatch(base, TZ), "result", "win");
    const patch = buildMatchPatch(edits, base, TZ);
    expect(patch).toEqual({ result: "win" });
    expect("riotMatchId" in patch).toBe(false);
    expect("playedAt" in patch).toBe(false);
    expect("durationSeconds" in patch).toBe(false);
  });

  it("result, duration and date fetched from Riot are kept when the person saves something else", () => {
    let edits: MatchEdits = withEdit({}, formFromMatch(base, TZ), "opponentName", "Team Example");
    const fetched: EditableMatch = { ...base, riotMatchId: "OC1_1", result: "win", durationSeconds: 31 * 60, playedAt: "2026-10-15T10:01:00.000Z" };
    edits = pendingEdits(edits, formFromMatch(fetched, TZ));
    expect(buildMatchPatch(edits, fetched, TZ)).toEqual({ opponentName: "Team Example" });
  });

  it("an edit typed back to the server's value is no edit", () => {
    const server = formFromMatch({ ...base, notes: "Same" }, TZ);
    let edits = withEdit({}, server, "notes", "Changed");
    edits = withEdit(edits, server, "notes", "Same");
    expect(edits).toEqual({});
  });

  it("an edit the server now matches is finished (after a save and refresh)", () => {
    const edits = withEdit({}, formFromMatch(base, TZ), "result", "loss");
    expect(pendingEdits(edits, formFromMatch({ ...base, result: "loss" }, TZ))).toEqual({});
  });

  it("clearing the Riot ID on purpose unlinks; a cleared duration clears it", () => {
    const linked: EditableMatch = { ...base, riotMatchId: "OC1_1", durationSeconds: 1800 };
    const server = formFromMatch(linked, TZ);
    let edits = withEdit({}, server, "riotMatchId", "");
    edits = withEdit(edits, server, "minutes", "");
    expect(buildMatchPatch(edits, linked, TZ)).toEqual({ riotMatchId: null, durationSeconds: null });
  });

  it("an untouched date is never sent; a changed date keeps the local time of day", () => {
    expect(buildMatchPatch({ notes: "x" }, base, TZ)).toEqual({ notes: "x" });
    const server = formFromMatch(base, TZ);
    expect(server.playedOn).toBe("2026-10-15"); // 20:15 in Sydney
    const patch = buildMatchPatch(withEdit({}, server, "playedOn", "2026-10-16"), base, TZ);
    expect(patch).toEqual({ playedAt: "2026-10-16T09:15:00.000Z" });
  });

  it("enemy names compare as lists (order kept, blanks ignored) and are sent as five slots", () => {
    const named: EditableMatch = { ...base, enemyPlayers: { TOP: "A", JUNGLE: "B" } };
    const server = formFromMatch(named, TZ);
    expect(withEdit({}, server, "enemyPlayers", ["A", "B", ""])).toEqual({});
    const patch = buildMatchPatch(withEdit({}, server, "enemyPlayers", ["A"]), named, TZ);
    expect(patch.enemyPlayers).toEqual({ TOP: "A", JUNGLE: "", MID: "", ADC: "", SUPPORT: "" });
  });
});
