import { ROLES, type Role } from "../roles";
import { legalRolesFor, roleDistance } from "./eligibility";
import type { PlayerProfile } from "./types";

export type Assignment = Record<Role, string>;

export interface AssignmentOption {
  assignment: Assignment;
  /** Players not playing their primary role under this assignment. */
  flexedPlayerIds: string[];
  /** Number of players moved off their primary role. */
  swapCount: number;
  /** Sum of role distances (secondary 1, additional roles 2+): how far the placement is from everyone's preference. */
  roleCost: number;
}

/**
 * Enumerate every legal way to place the five active players into the five roles.
 * A placement is legal when every player is in one of their configured roles and every role
 * is covered exactly once. With five players this is at most 5! = 120 permutations, but
 * real lineups usually have only a handful of legal options.
 */
export function enumerateLegalAssignments(players: PlayerProfile[], locked: Partial<Assignment> = {}): AssignmentOption[] {
  if (players.length !== ROLES.length) return [];
  const results: AssignmentOption[] = [];
  const used = new Set<string>();
  const current: Partial<Assignment> = {};

  const recurse = (roleIndex: number) => {
    if (roleIndex === ROLES.length) {
      const assignment = { ...current } as Assignment;
      const flexed = players.filter((p) => assignment[p.primaryRole] !== p.id).map((p) => p.id);
      const roleCost = ROLES.reduce((s, r) => s + roleDistance(players.find((p) => p.id === assignment[r])!, r), 0);
      results.push({ assignment, flexedPlayerIds: flexed, swapCount: flexed.length, roleCost });
      return;
    }
    const role = ROLES[roleIndex]!;
    const lockedPlayer = locked[role];
    for (const p of players) {
      if (used.has(p.id)) continue;
      if (lockedPlayer && lockedPlayer !== p.id) continue;
      if (!legalRolesFor(p).includes(role)) continue;
      used.add(p.id);
      current[role] = p.id;
      recurse(roleIndex + 1);
      delete current[role];
      used.delete(p.id);
    }
  };
  recurse(0);
  // Closest to everyone's preference first (additional roles cost more than secondary ones), then fewer moves.
  results.sort((a, b) => a.roleCost - b.roleCost || a.swapCount - b.swapCount);
  return results;
}

export interface AssignmentValidation {
  ok: boolean;
  errors: string[];
}

export function validateAssignment(players: PlayerProfile[], assignment: Partial<Record<Role, string>>): AssignmentValidation {
  const errors: string[] = [];
  const byId = new Map(players.map((p) => [p.id, p] as const));
  const seen = new Set<string>();
  for (const role of ROLES) {
    const pid = assignment[role];
    if (!pid) {
      errors.push(`${role} has no player assigned.`);
      continue;
    }
    const player = byId.get(pid);
    if (!player) {
      errors.push(`${role} is assigned to a player who is not in the active lineup.`);
      continue;
    }
    if (seen.has(pid)) errors.push(`${player.displayName} is assigned to more than one role.`);
    seen.add(pid);
    if (!legalRolesFor(player).includes(role)) {
      errors.push(`${player.displayName} cannot play ${role} (configured roles: ${legalRolesFor(player).join(", ")}).`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Default assignment: everyone on their primary role. Returns null when primaries collide. */
export function defaultAssignment(players: PlayerProfile[]): Assignment | null {
  const assignment: Partial<Assignment> = {};
  for (const p of players) {
    if (assignment[p.primaryRole]) return null;
    assignment[p.primaryRole] = p.id;
  }
  for (const role of ROLES) if (!assignment[role]) return null;
  return assignment as Assignment;
}

/** Describe the differences between two assignments as player moves. */
export function describeSwap(players: PlayerProfile[], from: Assignment, to: Assignment): Array<{ playerId: string; displayName: string; from: Role; to: Role }> {
  const byId = new Map(players.map((p) => [p.id, p] as const));
  const fromRole = new Map<string, Role>();
  for (const role of ROLES) fromRole.set(from[role], role);
  const moves: Array<{ playerId: string; displayName: string; from: Role; to: Role }> = [];
  for (const role of ROLES) {
    const pid = to[role];
    const prev = fromRole.get(pid);
    if (prev && prev !== role) {
      moves.push({ playerId: pid, displayName: byId.get(pid)?.displayName ?? pid, from: prev, to: role });
    }
  }
  return moves;
}
