import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { users } from "@/server/db/schema";
import { ROLES, type Role } from "@/domain/roles";
import { getCurrentLineup, getOrCreateTeam, getPlayer, type PlayerRecord } from "@/server/repositories/team";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { avatarUrl } from "@/server/repositories/users";
import { rankView, type RankView } from "./overview";

export interface ProfileHeaderData {
  player: PlayerRecord;
  username: string | null;
  avatarUrl: string | null;
  lineupRole: Role | null;
  rank: RankView | null;
}

/** What the profile header needs (cheap: no statistics). */
export async function loadProfileHeader(db: Db, playerId: string): Promise<ProfileHeaderData | null> {
  const player = await getPlayer(db, playerId);
  if (!player) return null;
  const team = await getOrCreateTeam(db);
  const [lineup, accounts, [user]] = await Promise.all([getCurrentLineup(db, team.id), listAccountsForPlayer(db, playerId), db.select({ id: users.id, username: users.username, avatarVersion: users.avatarVersion }).from(users).where(eq(users.playerId, playerId))]);
  const ranked = accounts.map((a) => ({ label: a.label, rank: rankView(a) })).filter((a) => a.rank);
  return {
    player,
    username: user?.username ?? null,
    avatarUrl: user ? avatarUrl(user.id, user.avatarVersion) : null,
    lineupRole: ROLES.find((r) => lineup.slots[r] === playerId) ?? null,
    rank: (ranked.find((a) => a.label === "main") ?? ranked[0])?.rank ?? null,
  };
}
