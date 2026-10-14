import { ROLES, type Role } from "../roles";

/*
  Enemy players for one draft are an unordered list of zero to five Riot IDs (or plain names for
  the match record). Nobody has to say who plays which role: the order of entry means nothing.
  Storage keeps the existing five keyed slots, filled in entry order, purely as slots; the role
  each scouted player most likely plays is inferred from their own match history.
*/

export const MAX_ENEMY_PLAYERS = 5;

/** The entered names in entry order, blanks removed. */
export function enemyNameList(names: Partial<Record<Role, string>> | null | undefined): string[] {
  return ROLES.map((r) => (names?.[r] ?? "").trim()).filter(Boolean);
}

/** Stores a list of names into the five slots, in order. */
export function enemySlotsFromList(list: readonly string[]): Partial<Record<Role, string>> {
  const clean = list.map((s) => s.trim()).filter(Boolean).slice(0, MAX_ENEMY_PLAYERS);
  return Object.fromEntries(clean.map((name, i) => [ROLES[i]!, name])) as Partial<Record<Role, string>>;
}

export interface InferredRole {
  role: Role;
  /** 0..1 share of the player's games in that role; 0 when nothing points to a role. */
  certainty: number;
  /** False only when the role came from somewhere other than games (never used today). */
  inferred: boolean;
}

/**
 * The most likely role of each scouted player, from the roles of their own games. Players are
 * assigned greedily by how clearly they play one role (two players never get the same role); a
 * player without games, or whose roles are all taken, gets a free role with certainty 0 so the
 * engine leans on them very little.
 */
export function inferEnemyRoles(players: Array<{ key: string; games: Partial<Record<Role, number>> }>): Map<string, InferredRole> {
  const candidates: Array<{ key: string; role: Role; share: number; games: number }> = [];
  for (const p of players) {
    const total = ROLES.reduce((s, r) => s + (p.games[r] ?? 0), 0);
    if (total === 0) continue;
    for (const role of ROLES) {
      const g = p.games[role] ?? 0;
      if (g > 0) candidates.push({ key: p.key, role, share: g / total, games: g });
    }
  }
  candidates.sort((a, b) => b.share - a.share || b.games - a.games);
  const out = new Map<string, InferredRole>();
  const used = new Set<Role>();
  for (const c of candidates) {
    if (out.has(c.key) || used.has(c.role)) continue;
    out.set(c.key, { role: c.role, certainty: c.share, inferred: true });
    used.add(c.role);
  }
  for (const p of players) {
    if (out.has(p.key)) continue;
    const free = ROLES.find((r) => !used.has(r));
    if (!free) continue;
    out.set(p.key, { role: free, certainty: 0, inferred: true });
    used.add(free);
  }
  return out;
}
