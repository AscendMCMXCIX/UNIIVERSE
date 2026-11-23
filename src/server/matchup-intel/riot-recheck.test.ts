import { describe, expect, it } from "vitest";
import { checkBaseline, recheckOf } from "./view";
import { freshnessWords } from "@/components/matchup-intel/wording";
import { getChampionNotes, getMatchupNotes } from "./curated";
import type { Verification } from "@/domain/matchup-intel/types";

/*
  OD6 (23 Nov 2026): a curated check re-checked against Riot's own sources (Data Dragon and the patch
  notes) counts its age from that re-check, and says so as "no Riot change by 26.23", never as a new
  check of the wiki or by a person; shown only once the game has reached that patch.
*/

const checked: Verification = { patch: "26.22", ddragonVersion: "16.22.1", checkedOn: "2026-11-17", riotRecheck: { patch: "26.23", ddragonVersion: "16.23.1", on: "2026-11-23" } };

describe("the Riot re-check (OD6)", () => {
  it("counts the age from the re-check once the game has reached it, and shows it only then", () => {
    expect(checkBaseline(checked, "16.23.1")).toEqual({ baseline: "16.23.1", shown: checked });
    // A patch on from the re-check: one patch since, not two.
    const at24 = checkBaseline(checked, "16.24.1");
    expect(recheckOf(at24.baseline, ["16.24.1"])).toMatchObject({ patch: "26.24", patches: 1, expired: false });
    // Three patches on from it: hidden then, as any check.
    expect(recheckOf(checkBaseline(checked, "16.26.1").baseline, ["16.26.1"])).toMatchObject({ patches: 3, expired: true });
    // The game still on the checked patch (the pinned demo): the re-check is not shown, and the age counts from the check.
    const { riotRecheck: _r, ...plain } = checked;
    expect(checkBaseline(checked, "16.22.1")).toEqual({ baseline: "16.22.1", shown: plain });
    expect(checkBaseline(plain, "16.23.1")).toEqual({ baseline: "16.22.1", shown: plain });
  });

  it("says what was re-checked, and nothing more", () => {
    expect(freshnessWords("unchanged-since", "26.22", checked.riotRecheck).checked).toBe("Checked on patch 26.22 · no Riot change by 26.23");
    expect(freshnessWords("unchanged-since", "26.22", null).checked).toBe("Checked on patch 26.22");
    expect(freshnessWords("changed-since", "26.22", checked.riotRecheck).warning).toMatch(/may be out of date/);
  });

  it("is recorded on every curated file, for patch 26.23", () => {
    for (const id of ["Riven", "Mordekaiser", "Ambessa", "Renekton", "Gwen", "Ornn"]) expect(getChampionNotes(id)!.verified.riotRecheck, id).toEqual(checked.riotRecheck);
    for (const [a, b] of [["Riven", "Mordekaiser"], ["Ambessa", "Renekton"], ["Gwen", "Ornn"]] as const) expect(getMatchupNotes(a, b)!.verified.riotRecheck).toEqual(checked.riotRecheck);
  });
});
