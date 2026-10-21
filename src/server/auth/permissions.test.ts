import { describe, expect, it } from "vitest";
import { ACCESS_GROUPS, sanitiseAccessGroups, withAccessGroups, CAPABILITY_KEYS, canEditPlayer, canManageRiotAccounts, canUseAdminArea, capabilitiesOf, describeAccess, hasPermission, isAdmin, sanitiseCapabilities, STANDARD_PLAYER, type Capability, type Session } from "./permissions";
import { NAV_LINKS, canOpen } from "@/lib/nav";

const base = { userId: "u-self", label: "U", playerId: "p-self", username: "u", hasPassword: true, mustChangePassword: false, setupComplete: true };
const admin: Session = { ...base, role: "owner" };
const player: Session = { ...base, role: "player", capabilities: STANDARD_PLAYER };
const retiredCoach: Session = { ...base, role: "coach" };
const restricted: Session = { ...base, role: "player", capabilities: ["view-team", "view-players", "view-matches", "edit-own-profile"] };
const delegate: Session = { ...base, role: "player", capabilities: [...STANDARD_PLAYER, "manage-lineup", "manage-players", "manage-matches"] };
/** The rights only administrators (the Owner included) hold: accounts and the settings of Admin Mode. */
const OWNER_ONLY = ["manage-users", "manage-branding", "manage-data"] as const;

describe("capabilities: Owner / Admin, Standard Player and custom sets", () => {
  it("an owner holds every capability, the owner-only ones included", () => {
    for (const c of CAPABILITY_KEYS) expect(hasPermission(admin, c), c).toBe(true);
    expect(hasPermission(admin, "manage-users")).toBe(true);
    expect(isAdmin(admin)).toBe(true);
    expect(canUseAdminArea(admin)).toBe(true);
    expect(canEditPlayer(admin, "someone-else")).toBe(true);
  });

  it("a Standard Player views everything and edits only their own profile", () => {
    for (const c of OWNER_ONLY) expect(hasPermission(player, c), c).toBe(false);
    for (const c of ["view-team", "view-players", "view-teammate-stats", "view-matches"] as Capability[]) expect(hasPermission(player, c), c).toBe(true);
    expect(canUseAdminArea(player)).toBe(false);
    expect(canEditPlayer(player, "p-self")).toBe(true);
    expect(canEditPlayer(player, "someone-else")).toBe(false);
    expect(canEditPlayer({ ...player, playerId: null }, "p-self")).toBe(false);
    expect(canManageRiotAccounts(player, "p-self")).toBe(true);
    expect(canManageRiotAccounts(player, "someone-else")).toBe(false);
  });

  it("a session without resolved capabilities gets the Standard Player set", () => {
    expect([...capabilitiesOf({ ...base, role: "player" })].sort()).toEqual([...STANDARD_PLAYER].sort());
  });

  it("removing a capability removes the right it grants", () => {
    expect(hasPermission(restricted, "view-teammate-stats")).toBe(false);
    expect(canManageRiotAccounts(restricted, "p-self")).toBe(false);
    expect(canEditPlayer(restricted, "p-self")).toBe(true);
    expect(canEditPlayer({ ...restricted, capabilities: ["view-team"] }, "p-self")).toBe(false);
  });

  it("delegated capabilities work on the ordinary pages and never open Admin Mode or reach owner-only rights", () => {
    expect(canUseAdminArea(delegate)).toBe(false);
    expect(hasPermission(delegate, "manage-lineup")).toBe(true);
    expect(hasPermission(delegate, "manage-players")).toBe(true);
    expect(hasPermission(delegate, "manage-matches")).toBe(true);
    for (const c of OWNER_ONLY) expect(hasPermission(delegate, c), c).toBe(false);
    // Even a stored list naming owner-only rights (sets saved before Phase 10 could hold the
    // site-setting ones) cannot grant them.
    const stored = ["manage-users", "manage-branding", "manage-data", "manage-competition"] as unknown as Capability[];
    for (const c of OWNER_ONLY) expect(hasPermission({ ...delegate, capabilities: stored }, c), c).toBe(false);
    expect(canUseAdminArea({ ...delegate, capabilities: stored })).toBe(false);
    expect(sanitiseCapabilities(["manage-users", "manage-branding", "view-team", "nonsense", "view-team"])).toEqual(["view-team"]);
    // Renaming an account changes nothing: only the stored role makes the Owner.
    expect(canUseAdminArea({ ...player, username: "adminascend", label: "adminascend" })).toBe(false);
  });

  it("a retired Team Leader / Draft Lead (coach) account is just a player, never admin", () => {
    for (const c of OWNER_ONLY) expect(hasPermission(retiredCoach, c), c).toBe(false);
    expect(canUseAdminArea(retiredCoach)).toBe(false);
    expect(isAdmin(retiredCoach)).toBe(false);
  });

  it("nobody signed in has no rights", () => {
    for (const c of CAPABILITY_KEYS) expect(hasPermission(null, c)).toBe(false);
    expect(canEditPlayer(null, "p-self")).toBe(false);
    expect(canUseAdminArea(null)).toBe(false);
  });

  it("labels say what the account is", () => {
    expect(describeAccess({ role: "owner" })).toBe("Owner");
    expect(describeAccess({ role: "coach" })).toBe("Player");
    expect(describeAccess({ role: "player" })).toBe("Player");
  });
});

describe("administrators (users.is_admin): a permission on top of a player account", () => {
  const administrator: Session = { ...player, admin: true };

  it("hold every permission and open Admin Mode, while the account stays a player with its own profile", () => {
    expect(isAdmin(administrator)).toBe(true);
    expect(canUseAdminArea(administrator)).toBe(true);
    for (const c of [...CAPABILITY_KEYS, ...OWNER_ONLY]) expect(hasPermission(administrator, c), c).toBe(true);
    expect(administrator.role).toBe("player");
    expect(canEditPlayer(administrator, "p-self")).toBe(true);
  });

  it("come only from the stored flag: without it, every administrator right is gone and their own level applies again", () => {
    const revoked: Session = { ...administrator, admin: false };
    expect(isAdmin(revoked)).toBe(false);
    expect(canUseAdminArea(revoked)).toBe(false);
    for (const c of OWNER_ONLY) expect(hasPermission(revoked, c), c).toBe(false);
    expect([...capabilitiesOf(revoked)].sort()).toEqual([...STANDARD_PLAYER].sort());
    // Nothing a player can hold stands in for it.
    expect(canUseAdminArea({ ...delegate, admin: undefined })).toBe(false);
  });

  it("are labelled as such; the Owner stays the Owner", () => {
    expect(describeAccess({ role: "player", isAdmin: true })).toBe("Administrator");
    expect(describeAccess({ role: "owner", isAdmin: false })).toBe("Owner");
    expect(describeAccess({ role: "player", isAdmin: false })).toBe("Player");
  });
});

describe("additional access groups", () => {
  it("add a group's capabilities to the base level, never take any away", () => {
    expect(withAccessGroups(["view-team"], ["lineup-manager"])).toEqual(["view-team", "manage-lineup"]);
    expect(withAccessGroups(STANDARD_PLAYER, [])).toEqual([...STANDARD_PLAYER]);
    expect(sanitiseAccessGroups(["lineup-manager", "owner", "lineup-manager", 3])).toEqual(["lineup-manager"]);
  });

  it("never include owner-only rights, and none of them opens Admin Mode", () => {
    for (const g of ACCESS_GROUPS) for (const c of OWNER_ONLY) expect(g.capabilities as readonly string[]).not.toContain(c);
    const everything: Session = { ...base, role: "player", capabilities: withAccessGroups(CAPABILITY_KEYS, ACCESS_GROUPS.map((g) => g.key)) };
    expect(canUseAdminArea(everything)).toBe(false);
    // Groups retired in Phase 10 (they opened Admin pages) are dropped when read.
    expect(sanitiseAccessGroups(["branding-manager", "data-manager", "draft-settings-manager", "lineup-manager"])).toEqual(["lineup-manager"]);
  });

  it("a lineup manager stays a player: the Admin area does not open for lineup management alone", () => {
    const lineupManager: Session = { ...base, role: "player", capabilities: withAccessGroups(STANDARD_PLAYER, ["lineup-manager"]) };
    expect(hasPermission(lineupManager, "manage-lineup")).toBe(true);
    expect(canUseAdminArea(lineupManager)).toBe(false);
    expect(hasPermission(lineupManager, "manage-users")).toBe(false);
  });
});


describe("What they can do (Admin access dialog) matches the server's own decision", () => {
  it("effectiveCapabilities equals hasPermission for every level, group and membership combination", async () => {
    const { effectiveCapabilities } = await import("./permissions");
    const bases: Capability[][] = [[...STANDARD_PLAYER], ["view-team", "view-players", "view-matches", "edit-own-profile"], ["edit-own-profile", "manage-own-riot-accounts"], []];
    const groupSets = [[], ["lineup-manager"], ["lineup-manager", "match-manager", "player-manager"]];
    for (const caps of bases)
      for (const groups of groupSets)
        for (const teamMember of [true, false]) {
          const session: Session = { ...base, role: "player", capabilities: withAccessGroups(caps, groups), teamMember };
          const shown = effectiveCapabilities({ owner: false, base: caps, groups, teamMember });
          for (const c of CAPABILITY_KEYS) expect(shown.has(c), `${c} · ${groups.join("+") || "no groups"} · ${teamMember ? "team" : "personal"}`).toBe(hasPermission(session, c));
        }
    expect(effectiveCapabilities({ owner: true, base: [], groups: [], teamMember: false }).size).toBe(CAPABILITY_KEYS.length);
  });

  it("a personal-use Standard Player keeps every personal ability and none of the team workspace", () => {
    const personal: Session = { ...player, teamMember: false };
    for (const c of ["edit-own-profile", "manage-own-riot-accounts"] as Capability[]) expect(hasPermission(personal, c), c).toBe(true);
    for (const c of ["view-team", "view-players", "view-teammate-stats", "view-matches", "manage-lineup"] as Capability[]) expect(hasPermission(personal, c), c).toBe(false);
    expect(canEditPlayer(personal, "p-self")).toBe(true);
    expect(canManageRiotAccounts(personal, "p-self")).toBe(true);
    expect(canManageRiotAccounts(personal, "someone-else")).toBe(false);
    // Team Leaderboards: in a team member's navigation, never in a personal-use account's.
    const leaderboards = NAV_LINKS.find((l) => l.href === "/leaderboards")!;
    expect(canOpen(player, leaderboards)).toBe(true);
    expect(canOpen(personal, leaderboards)).toBe(false);
  });
});
