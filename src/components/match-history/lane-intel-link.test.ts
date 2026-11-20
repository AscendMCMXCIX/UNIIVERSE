import { describe, expect, it, vi } from "vitest";

// The post-game view's module loads Match History's server actions; the link is worked out without them.
vi.mock("@/server/actions/match-history", () => ({}));

import { laneIntelLink } from "./post-game";
import type { MatchDetailView } from "@/server/players/match-history";
import type { MatchTimelineView } from "@/server/accounts/match-timeline";
import type { MatchNotes } from "@/domain/match-notes";

/*
  A lane's Focus note links Matchup Intel's page for the lane (PLAN S6c): the solo lane's pair, or in
  the bot lane (cue L5) both duos, from the timeline's lane pair; nothing for a note that is not the
  lane's, or when the opponent is unknown.
*/

const champ = (id: string | null) => ({ id: id ?? "", name: id ?? "?", portraitUrl: "" });
const team = (ids: Array<[number, string]>) => ({ participants: ids.map(([slot, championId]) => ({ slot, championId })) });
const view = (role: string, opponent: string | null) =>
  ({ role, championId: "Jinx", comparison: { opponent: opponent ? { championId: opponent } : null }, teams: [team([[0, "Jinx"], [1, "Thresh"]]), team([[5, "Caitlyn"], [6, "Leona"]])] }) as unknown as MatchDetailView;
const notes = (kind: string, cue: string) => ({ focus: { kind, cue } }) as unknown as MatchNotes;

describe("laneIntelLink", () => {
  it("a solo lane's Focus note links the pair", () => {
    const link = laneIntelLink(view("MID", "Caitlyn"), notes("lane", "L4"), champ, null);
    expect(link?.href).toBe("/resources/matchups?role=mid&champion=Jinx&vs=Caitlyn");
    expect(link?.label).toBe("Prepare Jinx vs Caitlyn in Matchup Intel");
  });
  it("the bot lane's (L5) links both duos from the timeline's pair, and nothing without the pair", () => {
    const tl = { pair: { allySlot: 1, opponentSlots: [5, 6] } } as unknown as MatchTimelineView;
    const link = laneIntelLink(view("ADC", "Caitlyn"), notes("lane", "L5"), champ, tl);
    expect(link?.href).toBe("/resources/matchups?role=adc&champion=Jinx&ally=Thresh&vs=Caitlyn&vs2=Leona");
    expect(link?.label).toBe("Prepare Jinx and Thresh vs Caitlyn and Leona in Matchup Intel");
    expect(laneIntelLink(view("ADC", "Caitlyn"), notes("lane", "L5"), champ, null)).toBeNull();
  });
  it("no link for a note that is not the lane's, or without the opponent", () => {
    expect(laneIntelLink(view("MID", "Caitlyn"), notes("vision", "V1"), champ, null)).toBeNull();
    expect(laneIntelLink(view("MID", null), notes("lane", "L4"), champ, null)).toBeNull();
  });
});
