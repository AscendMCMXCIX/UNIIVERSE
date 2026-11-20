import { describe, expect, it } from "vitest";
import { slotWords } from "@/components/matchup-intel/slots";
import { ROLE_SLOTS, matchupRolesVerdicts, type Role, type RoleBarRead } from "../../../scripts/matchup-roles-facts.mjs";

/*
  The Production check's Matchup Intel role facts (scripts/matchup-roles-facts.mjs): the slots it
  expects are the app's own labels (slots.ts), and the verdicts pass on the demo's reading (20 Nov
  2026: opened on Top with no role in the address, then Jungle, Mid, ADC and Support pressed) and fail
  the regressions they exist for.
*/

const bar = (role: Role, addressRole: string | null = role, length = 3): RoleBarRead => ({ pressed: role, slots: String(ROLE_SLOTS[role].length), labels: [...ROLE_SLOTS[role]], addressRole, path: "/resources/matchups", length, busy: false });
const start = bar("top", null);
const demo = () => [{ role: "top", at: start }, ...(["jungle", "mid", "adc", "support"] as const).map((r) => ({ role: r, at: bar(r) }))];
const failed = (reads: Array<{ role: string; at: RoleBarRead }>) => matchupRolesVerdicts({ kind: "desktop", start, reads }).filter((v) => v.status === "FAIL").map((v) => v.name);

describe("Matchup Intel's role facts", () => {
  it("expect the app's own slot labels", () => {
    for (const role of Object.keys(ROLE_SLOTS) as Role[]) {
      const slots = ROLE_SLOTS[role].length === 2 ? (["you", "enemy"] as const) : (["you", "ally", "enemy", "enemy2"] as const);
      expect(slots.map((s) => slotWords(role, s).label).sort()).toEqual(ROLE_SLOTS[role]);
    }
  });
  it("pass on the demo's reading", () => {
    expect(matchupRolesVerdicts({ kind: "desktop", start, reads: demo() }).map((v) => v.status)).toEqual(Array(6).fill("PASS"));
  });
  it("fail a duo role with two slots, a solo role with four, and a role missing from the address", () => {
    const reads = demo();
    reads[3] = { role: "adc", at: { ...bar("adc"), slots: "2", labels: ["Enemy", "Your champion"] } };
    reads[1] = { role: "jungle", at: { ...bar("jungle"), slots: "4", labels: [...ROLE_SLOTS.adc] } };
    reads[2] = { role: "mid", at: bar("mid", null) };
    expect(failed(reads)).toHaveLength(3);
  });
  it("fail a role that did not press, and roles that push history entries", () => {
    const reads = demo();
    reads[4] = { role: "support", at: { ...bar("support", "support", 7), pressed: "adc" } };
    expect(failed(reads)).toHaveLength(2);
  });
});
