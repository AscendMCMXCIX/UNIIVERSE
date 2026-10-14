import type { Db } from "@/server/db/types";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { legalRolesFor, poolFor, roleFit, roleRank, type RoleFit } from "@/domain/roster";
import { getCurrentLineup, listPlayers } from "@/server/repositories/team";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";

export interface SetupSlot {
  role: Role;
  roleLabel: string;
  player: { id: string; name: string; avatarUrl: string | null; fit: RoleFit; substitute: boolean; poolSize: number } | null;
  /** Players who may take the slot: main players first, then substitutes. */
  candidates: Array<{ id: string; name: string; fit: RoleFit; substitute: boolean }>;
}

/** The active lineup as draft setup shows it: five slots with picture, role fit and pool size. No statistics. */
export async function getSetupLineup(db: Db, teamId: string): Promise<{ slots: SetupSlot[]; complete: boolean }> {
  const [players, lineup, avatars] = await Promise.all([listPlayers(db, teamId), getCurrentLineup(db, teamId), avatarUrlsByPlayer(db)]);
  const byId = new Map(players.map((p) => [p.id, p]));
  const slots = ROLES.map((role): SetupSlot => {
    const p = lineup.slots[role] ? byId.get(lineup.slots[role]!) : undefined;
    const candidates = players
      .filter((c) => legalRolesFor(c).includes(role))
      .sort((a, b) => Number(a.group === "other") - Number(b.group === "other") || roleRank(a, role) - roleRank(b, role) || a.displayName.localeCompare(b.displayName))
      .map((c) => ({ id: c.id, name: c.displayName, fit: roleFit(c, role), substitute: c.group === "other" }));
    if (!p) return { role, roleLabel: ROLE_LABELS[role], player: null, candidates };
    const fit = roleFit(p, role);
    return { role, roleLabel: ROLE_LABELS[role], player: { id: p.id, name: p.displayName, avatarUrl: avatars[p.id] ?? null, fit, substitute: p.group === "other", poolSize: poolFor(p, role).length }, candidates };
  });
  return { slots, complete: slots.every((s) => s.player) };
}
