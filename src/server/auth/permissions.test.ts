import { describe, expect, it } from "vitest";
import { ADMIN_CAPABILITIES, CAPABILITY_KEYS, canControlDraft, canEditPlayer, canManageRiotAccounts, canUseAdminArea, capabilitiesOf, describeAccess, hasPermission, isAdmin, sanitiseCapabilities, STANDARD_PLAYER, type Capability, type Session } from "./permissions";

const base = { userId: "u-self", label: "U", playerId: "p-self", username: "u", hasPassword: true, mustChangePassword: false, setupComplete: true };
const admin: Session = { ...base, role: "owner" };
const player: Session = { ...base, role: "player", capabilities: STANDARD_PLAYER };
const retiredCoach: Session = { ...base, role: "coach" };
const restricted: Session = { ...base, role: "player", capabilities: ["view-team", "view-players", "view-matches", "edit-own-profile"] };
const delegate: Session = { ...base, role: "player", capabilities: [...STANDARD_PLAYER, "manage-lineup", "manage-branding"] };

describe("capabilities: Owner / Admin, Standard Player and custom sets", () => {
  it("an owner holds every capability, the owner-only ones included, and overrides any draft", () => {
    for (const c of CAPABILITY_KEYS) expect(hasPermission(admin, c), c).toBe(true);
    expect(hasPermission(admin, "manage-users")).toBe(true);
    expect(isAdmin(admin)).toBe(true);
    expect(canUseAdminArea(admin)).toBe(true);
    expect(canEditPlayer(admin, "someone-else")).toBe(true);
    expect(canControlDraft(admin, { createdByUserId: "another-user" })).toBe(true);
    expect(canControlDraft(admin, { createdByUserId: null })).toBe(true);
  });

  it("a Standard Player views everything, creates drafts, edits only their own profile and controls only their own drafts", () => {
    for (const c of ADMIN_CAPABILITIES) expect(hasPermission(player, c), c).toBe(false);
    expect(hasPermission(player, "manage-users")).toBe(false);
    for (const c of ["view-team", "view-players", "view-teammate-stats", "view-trends", "view-matches", "create-draft"] as Capability[]) expect(hasPermission(player, c), c).toBe(true);
    expect(canUseAdminArea(player)).toBe(false);
    expect(canEditPlayer(player, "p-self")).toBe(true);
    expect(canEditPlayer(player, "someone-else")).toBe(false);
    expect(canEditPlayer({ ...player, playerId: null }, "p-self")).toBe(false);
    expect(canManageRiotAccounts(player, "p-self")).toBe(true);
    expect(canManageRiotAccounts(player, "someone-else")).toBe(false);
    expect(canControlDraft(player, { createdByUserId: "u-self" })).toBe(true);
    expect(canControlDraft(player, { createdByUserId: "another-user" })).toBe(false);
    expect(canControlDraft(player, { createdByUserId: null })).toBe(false);
  });

  it("a session without resolved capabilities gets the Standard Player set", () => {
    expect([...capabilitiesOf({ ...base, role: "player" })].sort()).toEqual([...STANDARD_PLAYER].sort());
  });

  it("removing a capability removes the right it grants", () => {
    expect(hasPermission(restricted, "create-draft")).toBe(false);
    expect(hasPermission(restricted, "view-trends")).toBe(false);
    expect(hasPermission(restricted, "view-teammate-stats")).toBe(false);
    expect(canManageRiotAccounts(restricted, "p-self")).toBe(false);
    expect(canEditPlayer(restricted, "p-self")).toBe(true);
    expect(canEditPlayer({ ...restricted, capabilities: ["view-team"] }, "p-self")).toBe(false);
  });

  it("delegated admin capabilities open only their own part of the Admin area, never the owner-only rights", () => {
    expect(canUseAdminArea(delegate)).toBe(true);
    expect(hasPermission(delegate, "manage-lineup")).toBe(true);
    expect(hasPermission(delegate, "manage-branding")).toBe(true);
    expect(hasPermission(delegate, "manage-data")).toBe(false);
    expect(hasPermission(delegate, "manage-users")).toBe(false);
    // Even a stored list naming the owner-only right cannot grant it.
    expect(hasPermission({ ...delegate, capabilities: ["manage-users" as Capability] }, "manage-users")).toBe(false);
    expect(sanitiseCapabilities(["manage-users", "view-team", "nonsense", "view-team"])).toEqual(["view-team"]);
  });

  it("match managers may take over any draft", () => {
    expect(canControlDraft({ ...player, capabilities: [...STANDARD_PLAYER, "manage-matches"] }, { createdByUserId: "another-user" })).toBe(true);
  });

  it("a retired Team Leader / Draft Lead (coach) account is just a player, never admin", () => {
    for (const c of ADMIN_CAPABILITIES) expect(hasPermission(retiredCoach, c), c).toBe(false);
    expect(isAdmin(retiredCoach)).toBe(false);
    expect(canControlDraft(retiredCoach, { createdByUserId: "another-user" })).toBe(false);
  });

  it("nobody signed in has no rights", () => {
    for (const c of CAPABILITY_KEYS) expect(hasPermission(null, c)).toBe(false);
    expect(canEditPlayer(null, "p-self")).toBe(false);
    expect(canControlDraft(null, { createdByUserId: null })).toBe(false);
    expect(canUseAdminArea(null)).toBe(false);
  });

  it("labels say what the account is", () => {
    expect(describeAccess({ role: "owner" })).toBe("Owner");
    expect(describeAccess({ role: "coach" })).toBe("Player");
    expect(describeAccess({ role: "player" })).toBe("Player");
  });
});
