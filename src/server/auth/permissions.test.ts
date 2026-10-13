import { describe, expect, it } from "vitest";
import { canControlDraft, canEditPlayer, describeAccess, hasPermission, isAdmin, type Permission, type Session } from "./permissions";

const base = { userId: "u-self", label: "U", playerId: "p-self", username: "u", hasPassword: true, setupComplete: true };
const admin: Session = { ...base, role: "owner" };
const player: Session = { ...base, role: "player", hasPassword: false };
const retiredCoach: Session = { ...base, role: "coach" };
const ADMIN_ONLY: Permission[] = ["manage-team", "manage-players", "manage-users", "manage-settings", "manage-lineup", "manage-matches"];

describe("permission matrix: Owner / Admin and Player", () => {
  it("ADMIN may do everything and override any draft", () => {
    for (const p of [...ADMIN_ONLY, "create-draft", "view-analysis"] as Permission[]) expect(hasPermission(admin, p), p).toBe(true);
    expect(isAdmin(admin)).toBe(true);
    expect(canEditPlayer(admin, "someone-else")).toBe(true);
    expect(canControlDraft(admin, { createdByUserId: "another-user" })).toBe(true);
    expect(canControlDraft(admin, { createdByUserId: null })).toBe(true);
  });

  it("PLAYER views everything, creates drafts, edits only their own profile and controls only their own drafts", () => {
    for (const p of ADMIN_ONLY) expect(hasPermission(player, p), p).toBe(false);
    expect(hasPermission(player, "view-analysis")).toBe(true);
    expect(hasPermission(player, "create-draft")).toBe(true);
    expect(canEditPlayer(player, "p-self")).toBe(true);
    expect(canEditPlayer(player, "someone-else")).toBe(false);
    expect(canEditPlayer({ ...player, playerId: null }, "p-self")).toBe(false);
    expect(canControlDraft(player, { createdByUserId: "u-self" })).toBe(true);
    expect(canControlDraft(player, { createdByUserId: "another-user" })).toBe(false);
    expect(canControlDraft(player, { createdByUserId: null })).toBe(false);
  });

  it("a retired Team Leader / Draft Lead (coach) account has exactly the player's rights, never admin", () => {
    for (const p of ADMIN_ONLY) expect(hasPermission(retiredCoach, p), p).toBe(false);
    expect(isAdmin(retiredCoach)).toBe(false);
    expect(canControlDraft(retiredCoach, { createdByUserId: "another-user" })).toBe(false);
  });

  it("nobody signed in has no rights", () => {
    for (const p of [...ADMIN_ONLY, "create-draft", "view-analysis"] as Permission[]) expect(hasPermission(null, p)).toBe(false);
    expect(canEditPlayer(null, "p-self")).toBe(false);
    expect(canControlDraft(null, { createdByUserId: null })).toBe(false);
  });

  it("labels say what the account is", () => {
    expect(describeAccess({ role: "owner" })).toBe("Admin");
    expect(describeAccess({ role: "coach" })).toBe("Player");
    expect(describeAccess({ role: "player" })).toBe("Player");
  });
});
