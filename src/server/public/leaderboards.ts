import type { Db } from "@/server/db/types";
import { loadLeaderboardData, type LeaderboardData } from "@/server/leaderboards/service";
import { cachedFor } from "@/server/observability/cache";
import { offeredSeasons, seasonOfPatch } from "@/domain/season";
import { publicAvatarUrl, publicLook, publicPlayers } from "./team";

/*
  PUBLIC DATA BOUNDARY (Leaderboards). Only where the deployment allows Riot data on the public
  pages (public/access.ts; the page is a 404 otherwise). The team's Leaderboards among the players
  the public Team page shows (the lineup and each role's designated substitute): their display
  names, public pictures and card looks, and their games. Built from the members' data field by
  field; nobody else on the team is named, and nobody else's games are counted.
*/

/** How long one instance reuses the public boards' data, like the public Team page. */
const PUBLIC_LEADERBOARDS_TTL_MS = 60_000;

export function loadPublicLeaderboardData(db: Db, teamId: string): Promise<LeaderboardData> {
  return cachedFor(
    `public-leaderboards:${teamId}`,
    PUBLIC_LEADERBOARDS_TTL_MS,
    async () => {
      const [data, members] = await Promise.all([loadLeaderboardData(db, teamId), publicPlayers(db, teamId)]);
      const games = data.games.filter((g) => members.has(g.playerId));
      return {
        players: data.players.flatMap((p) => {
          const member = members.get(p.id);
          if (!member) return [];
          return [
            {
              id: p.id,
              name: member.name,
              avatarUrl: publicAvatarUrl(p.id, member.avatarVersion),
              look: publicLook(p.look),
              art: p.art ? { championId: p.art.championId, skinNum: p.art.skinNum } : null,
              rank: p.rank ? { tier: p.rank.tier, division: p.rank.division, leaguePoints: p.rank.leaguePoints, queue: p.rank.queue } : null,
              primaryRole: p.primaryRole,
            },
          ];
        }),
        games,
        mastery: data.mastery.filter((m) => members.has(m.playerId)),
        lineupIds: data.lineupIds.filter((id) => members.has(id)),
        currentSeason: data.currentSeason,
        // The seasons these players' games offer (the supported ones only, as for members).
        seasons: offeredSeasons(data.currentSeason, games.map((g) => seasonOfPatch(g.patch))),
        lastUpdated: data.lastUpdated,
        extraSince: games.reduce<number | null>((m, g) => (g.extra && (m === null || g.gameCreation < m) ? g.gameCreation : m), null),
        rawGames: games.length,
      };
    },
    db,
  );
}
