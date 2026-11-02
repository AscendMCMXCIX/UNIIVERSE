import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";

/*
  Which stored games carry the members' current Riot player ids.

  Riot encrypts player ids (PUUIDs) for each registered application: a Development key and a
  Personal key see the same player under different ids, and an id from one cannot be read with
  the other. A linked account's own id is resolved again under the key in use (accounts/sync.ts),
  but a game keeps the ids of the key it was stored under, and Encounters, possible groups and
  rank badges group players by id.

  Each linked account's own place in its stored games tells which key a game was stored under: the
  entry for its champion (on its side, where the side is recorded) carries either the account's
  current id or another one. Read-only, and counts only: no id, name or game leaves the server.
*/

const DAY_MS = 86_400_000;
const AGES = ["last 30 days", "30-90 days", "90-365 days", "older"] as const;

export interface RiotIdFamily {
  /** Member places by the game's age: the account's current id, another id at its place, or no entry for it. */
  byAge: Array<{ age: (typeof AGES)[number]; places: number; currentId: number; anotherId: number; notFound: number }>;
  /** Places holding another id, by the week their game was stored (oldest first): when games were stored under another key. */
  anotherIdByStoredWeek: Array<{ week: string; places: number }>;
  verdict: string;
}

type Row = { bucket: number | string; week: string; places: number | string; current_id: number | string; another_id: number | string; not_found: number | string };

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

export async function riotIdFamily(db: Db, now: Date = new Date()): Promise<RiotIdFamily> {
  const t = now.getTime();
  const rows = rowsOf<Row>(
    await db.execute(sql`
      WITH places AS (
        SELECT am.game_creation, d.stored_at,
          EXISTS (SELECT 1 FROM jsonb_array_elements(d.participants) x WHERE x->>'puuid' = a.puuid) AS current_id,
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(d.participants) x
            WHERE x->>'championId' = am.champion_id
              AND (am.team_id IS NULL OR (x->>'teamId')::int = am.team_id)
              AND coalesce(x->>'puuid', '') NOT IN ('', a.puuid)
              AND coalesce(x->>'removed', '') <> 'true'
          ) AS another_id
        FROM account_matches am
        JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player' AND a.puuid IS NOT NULL
        JOIN match_details d ON d.match_id = am.match_id
        WHERE am.champion_id IS NOT NULL AND jsonb_array_length(d.participants) > 0
      )
      SELECT
        CASE WHEN game_creation >= ${t - 30 * DAY_MS} THEN 0 WHEN game_creation >= ${t - 90 * DAY_MS} THEN 1 WHEN game_creation >= ${t - 365 * DAY_MS} THEN 2 ELSE 3 END AS bucket,
        to_char(date_trunc('week', stored_at), 'YYYY-MM-DD') AS week,
        count(*) AS places,
        count(*) FILTER (WHERE current_id) AS current_id,
        count(*) FILTER (WHERE NOT current_id AND another_id) AS another_id,
        count(*) FILTER (WHERE NOT current_id AND NOT another_id) AS not_found
      FROM places
      GROUP BY 1, 2`),
  );

  const byAge = AGES.map((age) => ({ age, places: 0, currentId: 0, anotherId: 0, notFound: 0 }));
  const weeks = new Map<string, number>();
  for (const r of rows) {
    const b = byAge[Number(r.bucket)]!;
    b.places += Number(r.places);
    b.currentId += Number(r.current_id);
    b.anotherId += Number(r.another_id);
    b.notFound += Number(r.not_found);
    if (Number(r.another_id) > 0) weeks.set(r.week, (weeks.get(r.week) ?? 0) + Number(r.another_id));
  }
  const anotherIdByStoredWeek = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, places]) => ({ week, places }));
  const another = byAge.reduce((n, b) => n + b.anotherId, 0);
  const places = byAge.reduce((n, b) => n + b.places, 0);
  const verdict =
    places === 0
      ? "No stored game has a linked account's entry yet."
      : another === 0
        ? "Every stored game carries the members' current ids: all of them were stored under the key family in use, and nothing needs re-keying."
        : `${another} of ${places} member places, in games stored in the weeks of ${anotherIdByStoredWeek[0]!.week} to ${anotherIdByStoredWeek.at(-1)!.week}, carry another id: those games were stored under another key and need re-keying (docs/RIOT_COMPLIANCE.md, item 2).`;
  return { byAge: byAge.filter((b) => b.places > 0), anotherIdByStoredWeek, verdict };
}
