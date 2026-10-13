import { describe, expect, it } from "vitest";
import { canEdit, canEditPlayer, describeAccess, hasPermission, isDraftLead, isOwner, type Permission, type Session } from "./permissions";

const base = { userId: "u", label: "U", playerId: "p-self", username: "u", hasPassword: true, setupComplete: true };
const owner: Session = { ...base, role: "owner", draftLead: false };
const teamLeader: Session = { ...base, role: "coach", draftLead: false };
const draftLeadPlayer: Session = { ...base, role: "player", draftLead: true };
const player: Session = { ...base, role: "player", draftLead: false };
const ALL: Permission[] = ["manage-team", "manage-players", "manage-users", "manage-settings", "manage-lineup", "control-draft", "manage-matches", "view-analysis"];

describe("permission matrix", () => {
  it("OWNER / ADMIN may do everything", () => {
    for (const p of ALL) expect(hasPermission(owner, p), p).toBe(true);
    expect(isOwner(owner)).toBe(true);
    expect(canEditPlayer(owner, "someone-else")).toBe(true);
  });

  it("TEAM LEADER / DRAFT LEAD (coach role or the flag on a player) runs the competition, never the accounts or settings", () => {
    for (const s of [teamLeader, draftLeadPlayer]) {
      expect(isDraftLead(s)).toBe(true);
      expect(isOwner(s)).toBe(false);
      for (const p of ["manage-lineup", "control-draft", "manage-matches", "view-analysis"] as Permission[]) expect(hasPermission(s, p), p).toBe(true);
      for (const p of ["manage-team", "manage-players", "manage-users", "manage-settings"] as Permission[]) expect(hasPermission(s, p), p).toBe(false);
      expect(canEdit(s)).toBe(true);
      // Their own pools only: another player's profile is read-only to them.
      expect(canEditPlayer(s, "p-self")).toBe(true);
      expect(canEditPlayer(s, "someone-else")).toBe(false);
    }
  });

  it("PLAYER views everything and edits only their own profile", () => {
    expect(hasPermission(player, "view-analysis")).toBe(true);
    for (const p of ALL.filter((p) => p !== "view-analysis")) expect(hasPermission(player, p), p).toBe(false);
    expect(isDraftLead(player)).toBe(false);
    expect(canEdit(player)).toBe(false);
    expect(canEditPlayer(player, "p-self")).toBe(true);
    expect(canEditPlayer(player, "someone-else")).toBe(false);
    expect(canEditPlayer({ ...player, playerId: null }, "p-self")).toBe(false);
  });

  it("nobody signed in has no rights", () => {
    for (const p of ALL) expect(hasPermission(null, p)).toBe(false);
    expect(canEditPlayer(null, "p-self")).toBe(false);
    expect(isDraftLead(null)).toBe(false);
  });

  it("labels say what the account can do", () => {
    expect(describeAccess({ role: "owner", draftLead: false })).toBe("Owner / Admin");
    expect(describeAccess({ role: "coach", draftLead: false })).toBe("Team Leader / Draft Lead");
    expect(describeAccess({ role: "player", draftLead: true })).toBe("Player · Draft Lead");
    expect(describeAccess({ role: "player", draftLead: false })).toBe("Player");
  });
});
