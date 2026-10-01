import { eq } from "drizzle-orm";
import { defineJob } from "./registry";
import { dataRefreshStatus } from "@/server/db/schema";
import { buildResolver, createProProvider, storeProGames } from "@/server/pro";

defineJob({
  key: "pro-sync",
  description: "Import recent professional games (Leaguepedia by default, or an Oracle's Elixir CSV).",
  defaultIntervalMinutes: 24 * 60,
  run: async (ctx) => {
    const provider = createProProvider();
    if (!provider) return { ok: true, degraded: true, error: "Professional data provider disabled (PRO_DATA_PROVIDER=none).", summary: { skipped: true } };
    const [status] = await ctx.db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, "pro-sync"));
    const cursor = typeof status?.details?.cursor === "string" ? new Date(status.details.cursor) : null;
    // Overlap the window a little so late-reported games are not missed.
    const since = cursor && !Number.isNaN(cursor.getTime()) ? new Date(cursor.getTime() - 3 * 86_400_000) : null;
    const resolver = await buildResolver(ctx.db);
    let result;
    try {
      result = await provider.fetchGames({ since, limit: Number(process.env.PRO_MAX_GAMES_PER_RUN ?? 1500), resolver, log: ctx.log });
    } catch (err) {
      return { ok: true, degraded: true, error: `${provider.name}: ${(err as Error).message}. Existing professional data preserved.`, summary: { provider: provider.name } };
    }
    const inserted = await storeProGames(ctx.db, result.games);
    const newest = result.games.reduce<Date | null>((m, g) => (g.playedAt && (!m || g.playedAt > m) ? g.playedAt : m), null);
    return {
      ok: true,
      degraded: !!result.degraded,
      error: result.degraded,
      // Only advance the cursor when games actually arrived; a failed fetch must not skip a window.
      summary: { provider: provider.name, fetched: result.games.length, inserted, rejected: result.rejected, cursor: newest ? newest.toISOString() : cursor ? cursor.toISOString() : undefined },
    };
  },
});
