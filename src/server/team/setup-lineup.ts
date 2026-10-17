import type { Db } from "@/server/db/types";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { legalRolesFor, poolFor, roleFit, roleRank, type RoleFit } from "@/domain/roster";
import { getCurrentLineup, listPlayers } from "@/server/repositories/team";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";
import { cardArt, isCardAccent, type CardAccent, type CardArt } from "@/domain/player-card";
import { cardLookFor, type CardLook } from "@/domain/card-style";

export interface SetupSlot {
  role: Role;
  roleLabel: string;
  player: { id: string; name: string; avatarUrl: string | null; fit: RoleFit; substitute: boolean; poolSize: number; art: CardArt | null; accent: CardAccent; look: CardLook; topChampions: string[] } | null;
  /** Players who may take the slot: main players first, then substitutes. */
  candidates: Array<{ id: string; name: string; fit: RoleFit; substitute: boolean; setupPending: boolean }>;
  /** Members listed but not assignable: no role chosen yet. */
  waiting: Array<{ id: string; name: string }>;
}

/** The active lineup as draft setup shows it: five compact player cards (art, picture, role fit, first champions). No statistics. */
export async function getSetupLineup(db: Db, teamId: string): Promise<{ slots: SetupSlot[]; complete: boolean }> {
  const [lineup, avatars] = await Promise.all([getCurrentLineup(db, teamId), avatarUrlsByPlayer(db)]);
  const players = await listPlayers(db, teamId, { keep: Object.values(lineup.slots).filter((id): id is string => !!id) });
  const byId = new Map(players.map((p) => [p.id, p]));
  // Members without a chosen role: shown in each picker, never assignable.
  const waiting = players.filter((p) => !p.primaryRole && !p.archivedAt).map((p) => ({ id: p.id, name: p.displayName }));
  const slots = ROLES.map((role): SetupSlot => {
    const p = lineup.slots[role] ? byId.get(lineup.slots[role]!) : undefined;
    const candidates = players
      .filter((c) => legalRolesFor(c).includes(role))
      .sort((a, b) => Number(a.group === "other") - Number(b.group === "other") || roleRank(a, role) - roleRank(b, role) || a.displayName.localeCompare(b.displayName))
      .map((c) => ({ id: c.id, name: c.displayName, fit: roleFit(c, role), substitute: c.group === "other", setupPending: c.setupPending }));
    if (!p) return { role, roleLabel: ROLE_LABELS[role], player: null, candidates, waiting };
    const fit = roleFit(p, role);
    return { role, roleLabel: ROLE_LABELS[role], player: { id: p.id, name: p.displayName, avatarUrl: avatars[p.id] ?? null, fit, substitute: p.group === "other", poolSize: poolFor(p, role).length, art: cardArt(p), accent: isCardAccent(p.cardAccent) ? p.cardAccent : "default", look: cardLookFor(p), topChampions: poolFor(p, role).slice(0, 3) }, candidates, waiting };
  });
  return { slots, complete: slots.every((s) => s.player) };
}
