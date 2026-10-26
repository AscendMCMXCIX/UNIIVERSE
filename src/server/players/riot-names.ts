import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { riotAccounts } from "@/server/db/schema";
import { playedIn } from "@/server/accounts/match-details";
import { charactersIn, opggLinkFor, opggProfileUrl, platformOfMatchId, riotIdProblem, type KnownRiotId, type RiotIdProblem } from "@/domain/opgg";

/*
  The Riot ID to link a player by, from what UNIIVERSE already stores: no Riot request is made.
  A match records the Riot ID a player had in that game, which goes stale when they rename (the
  old name can then open nobody, or someone else). So, by PUUID:
    1. a linked account's Riot ID, which the account sync keeps current, on its server once Riot
       has confirmed it (until then, the match's own server);
    2. otherwise the full Riot ID (name and tag) from the newest stored Riot game after `since`
       that the player appears in, on that game's server.
  Players found in neither keep the Riot ID their own match recorded (domain/opgg opggLinkFor).
*/

type Row = { puuid: string; name: string | null; match_id: string };

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

/**
 * Newest known Riot IDs for these players. `since` (ms) bounds the search to games newer than the
 * ones on screen, so only the stored games that could hold a newer name are read.
 */
export async function knownRiotIds(db: Db, puuids: readonly string[], since: number): Promise<Map<string, KnownRiotId>> {
  const ids = [...new Set(puuids.filter(Boolean))];
  const out = new Map<string, KnownRiotId>();
  if (!ids.length) return out;
  const linked = await db
    .select({ puuid: riotAccounts.puuid, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine, platform: riotAccounts.platform, platformSource: riotAccounts.platformSource })
    .from(riotAccounts)
    // Demo accounts carry made-up Riot IDs that could belong to a real stranger: never linked.
    .where(and(eq(riotAccounts.ownerType, "player"), ne(riotAccounts.label, "demo"), ne(riotAccounts.syncStatus, "demo"), isNotNull(riotAccounts.puuid), inArray(riotAccounts.puuid, ids)));
  // The server only once Riot confirmed it (a player's own choice can be wrong); else the match's.
  for (const a of linked) if (a.puuid && a.gameName && a.tagLine) out.set(a.puuid, { riotId: `${a.gameName}#${a.tagLine}`, platform: a.platformSource === "riot" ? a.platform : null });
  const rest = ids.filter((id) => !out.has(id));
  if (!rest.length) return out;
  // Only the games these players appear in are opened (the players' index), and only newer ones.
  // Only real Riot games (their match id's form, as platformOfMatchId) and records with a tag count,
  // so a demo game's made-up name, or a record where Riot left the tag out, hides no older full one.
  const result = await db.execute(sql`
    SELECT DISTINCT ON (p->>'puuid') p->>'puuid' AS puuid, p->>'name' AS name, d.match_id
    FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) p
    WHERE ${playedIn(rest)} AND d.game_creation > ${since} AND d.match_id ~ '^[A-Z]+[0-9]*_[0-9]+$'
      AND p->>'puuid' IN (${sql.join(rest.map((id) => sql`${id}`), sql`, `)}) AND strpos(coalesce(p->>'name', ''), '#') > 0
    ORDER BY p->>'puuid', d.game_creation DESC`);
  for (const r of rowsOf<Row>(result)) {
    // Only on a server OP.GG lists.
    const platform = platformOfMatchId(r.match_id);
    if (r.name && platform) out.set(r.puuid, { riotId: r.name, platform });
  }
  return out;
}

/** The Riot ID rule before 26 Oct 2026 (code points, no joiners, letter-or-digit tags), so the audit can count what the change let through. */
function acceptedBefore(raw: string | null): boolean {
  const parts = (raw ?? "").split("#");
  if (parts.length !== 2) return false;
  const gameName = parts[0]!.trim();
  const length = [...gameName.normalize("NFC")].length;
  return length >= 1 && length <= 16 && !/\p{Cc}|\p{Cf}/u.test(gameName) && /^[\p{L}\p{N}]{3,5}$/u.test(parts[1]!.trim().normalize("NFC"));
}

/**
 * For the read-only data audit (counts only, nobody named): of the places in the Riot games stored
 * over the last 30 days, how many have an OP.GG link and from which Riot ID (a linked account's, a
 * newer game's or the game's own), and why the others have none ("server": one OP.GG does not
 * list). A link only says the address is well formed: OP.GG can still show "not found" for an
 * account it has not indexed yet. `tagLengths`: the places whose tag is outside 3–5 characters, by
 * server, length and kind ("oc1 2 latin"), to learn what Riot records before the rule changes.
 */
export async function opggCoverage(db: Db, now = new Date()) {
  const since = now.getTime() - 30 * 86_400_000;
  // One row per distinct way a place can be linked (repeated meetings fold together), with its count.
  // Only real Riot games (their match id's form, as platformOfMatchId): a demo game is nobody's place.
  const rows = rowsOf<{ name: string | null; platform: string; removed: boolean; newest: string | null; newest_platform: string | null; linked_id: string | null; linked_platform: string | null; member: boolean | null; places: number | string }>(
    await db.execute(sql`
      WITH p AS (
        SELECT x->>'puuid' AS puuid, x->>'name' AS name, d.game_creation, coalesce(x->>'removed', '') = 'true' AS removed,
          lower(split_part(d.match_id, '_', 1)) AS platform
        FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) x
        WHERE d.game_creation >= ${since} AND d.match_id ~ '^[A-Z]+[0-9]*_[0-9]+$'),
      newest AS (
        SELECT DISTINCT ON (puuid) puuid, name, platform FROM p
        WHERE NOT removed AND strpos(coalesce(name, ''), '#') > 0
        ORDER BY puuid, game_creation DESC)
      SELECT p.name, p.platform, p.removed, n.name AS newest, n.platform AS newest_platform,
        a.game_name || '#' || a.tag_line AS linked_id, CASE WHEN a.platform_source = 'riot' THEN a.platform END AS linked_platform,
        (pl.team_member AND pl.archived_at IS NULL) AS member, count(*) AS places
      FROM p LEFT JOIN newest n ON n.puuid = p.puuid
        LEFT JOIN riot_accounts a ON a.puuid = p.puuid AND a.owner_type = 'player' AND a.label <> 'demo' AND a.sync_status <> 'demo'
        LEFT JOIN players pl ON pl.id = a.player_id
      GROUP BY 1, 2, 3, 4, 5, 6, 7, 8`),
  );
  const notLinked: Record<RiotIdProblem | "server", number> = { "no-name": 0, "no-tag": 0, "tag-length": 0, "tag-characters": 0, "name-length": 0, "name-characters": 0, server: 0 };
  const linked = { byLinkedAccount: 0, byNewerRiotId: 0, byRecordedRiotId: 0 };
  let places = 0;
  let removed = 0;
  let teamMembers = 0;
  let recordedNamesNowAccepted = 0;
  let renamedSinceGame = 0;
  const tagLengths: Record<string, number> = {};
  for (const r of rows) {
    const n = Number(r.places);
    places += n;
    if (r.removed) {
      removed += n;
      continue;
    }
    if (r.member) teamMembers += n;
    if (r.newest && r.name && r.newest !== r.name) renamedSinceGame += n;
    if (r.name && !acceptedBefore(r.name) && !riotIdProblem(r.name)) recordedNamesNowAccepted += n;
    const known = r.linked_id ? { riotId: r.linked_id, platform: r.linked_platform } : r.newest && r.newest !== r.name ? { riotId: r.newest, platform: r.newest_platform } : null;
    if (opggLinkFor(r.name, r.platform, known)) {
      if (known && opggProfileUrl(known.riotId, known.platform ?? r.platform)) linked[r.linked_id ? "byLinkedAccount" : "byNewerRiotId"] += n;
      else linked.byRecordedRiotId += n;
    } else {
      const problem = riotIdProblem(r.name) ?? "server";
      notLinked[problem] += n;
      if (problem === "tag-length") {
        const tag = r.name!.split("#")[1]!.trim().normalize("NFC");
        const shape = `${r.platform} ${charactersIn(tag)} ${/^[0-9]+$/.test(tag) ? "digits" : /^[A-Za-z0-9]+$/.test(tag) ? "latin" : "other"}`;
        tagLengths[shape] = (tagLengths[shape] ?? 0) + n;
      }
    }
  }
  return { windowDays: 30, places, removed, teamMembers, linked, notLinked, tagLengths, recordedNamesNowAccepted, renamedSinceGame };
}
