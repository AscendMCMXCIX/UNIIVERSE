import type { Db } from "@/server/db/types";
import { champions, proGameBans, proGamePicks, proGames } from "@/server/db/schema";
import { ChampionNameResolver } from "./champion-names";
import { LeaguepediaProvider } from "./leaguepedia";
import { OraclesElixirCsvProvider } from "./oracles-elixir";
import type { ProDataProvider, ProGameRecord } from "./types";

export * from "./types";
export { ChampionNameResolver } from "./champion-names";
export { LeaguepediaProvider } from "./leaguepedia";
export { OraclesElixirCsvProvider, parseOraclesElixirCsv } from "./oracles-elixir";

/** Picks the configured professional data provider. "none" disables the pipeline. */
export function createProProvider(): ProDataProvider | null {
  const name = (process.env.PRO_DATA_PROVIDER ?? "leaguepedia").toLowerCase();
  if (name === "none" || name === "off") return null;
  if (name === "oracleselixir" || name === "oracles-elixir" || name === "oe") return new OraclesElixirCsvProvider({ url: process.env.PRO_DATA_CSV_URL });
  return new LeaguepediaProvider({ lookbackDays: Number(process.env.PRO_LOOKBACK_DAYS ?? 60) });
}

export async function buildResolver(db: Db): Promise<ChampionNameResolver> {
  const rows = await db.select({ id: champions.id, name: champions.name }).from(champions);
  return new ChampionNameResolver(rows);
}

/** Stores pro games idempotently (ids are provider-scoped primary keys). Returns the number of new games. */
export async function storeProGames(db: Db, games: ProGameRecord[]): Promise<number> {
  let inserted = 0;
  for (const g of games) {
    await db.transaction(async (tx) => {
      const rows = await tx
        .insert(proGames)
        .values({ id: g.id, provider: g.provider, tournament: g.tournament, league: g.league, patch: g.patch, playedAt: g.playedAt, blueTeam: g.blueTeam, redTeam: g.redTeam, winnerSide: g.winnerSide })
        .onConflictDoNothing()
        .returning({ id: proGames.id });
      if (rows.length === 0) return;
      await tx.insert(proGamePicks).values(g.picks.map((p) => ({ gameId: g.id, side: p.side, role: p.role, championId: p.championId, pickOrder: p.pickOrder }))).onConflictDoNothing();
      if (g.bans.length) await tx.insert(proGameBans).values(g.bans.map((b) => ({ gameId: g.id, side: b.side, banOrder: b.order, championId: b.championId }))).onConflictDoNothing();
      inserted += 1;
    });
  }
  return inserted;
}
