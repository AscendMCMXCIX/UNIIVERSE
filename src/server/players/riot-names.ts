import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { players, riotAccounts } from "@/server/db/schema";
import { playedIn } from "@/server/accounts/match-details";
import { charactersIn, opggLinkFor, opggProfileUrl, platformOfMatchId, riotIdProblem, tagProblem, type KnownRiotId, type RiotIdProblem } from "@/domain/opgg";

/*
  The Riot ID to link a player by, from what UNIIVERSE already stores: no Riot request is made.
  A match records the Riot ID a player had in that game, which goes stale when they rename (the
  old name can then open nobody, or someone else). So, by PUUID:
    1. a linked account's Riot ID, which the account sync keeps current, on its server once Riot
       has confirmed it (until then, the match's own server): a current team member's (on the
       team, not archived), or the accounts the caller names (`linked`, players/game-audience). A
       personal-use or archived profile's account is private to it, so it is read as anyone else's;
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
export async function knownRiotIds(db: Db, puuids: readonly string[], since: number, options: { linked?: ReadonlySet<string> } = {}): Promise<Map<string, KnownRiotId>> {
  const ids = [...new Set(puuids.filter(Boolean))];
  const out = new Map<string, KnownRiotId>();
  if (!ids.length) return out;
  const fromAccounts = options.linked ? ids.filter((id) => options.linked!.has(id)) : ids;
  const columns = { puuid: riotAccounts.puuid, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine, platform: riotAccounts.platform, platformSource: riotAccounts.platformSource };
  // Demo accounts carry made-up Riot IDs that could belong to a real stranger: never linked.
  const usable = and(eq(riotAccounts.ownerType, "player"), ne(riotAccounts.label, "demo"), ne(riotAccounts.syncStatus, "demo"), isNotNull(riotAccounts.puuid), inArray(riotAccounts.puuid, fromAccounts));
  const linked = !fromAccounts.length
    ? []
    : options.linked
      ? await db.select(columns).from(riotAccounts).where(usable)
      : await db.select(columns).from(riotAccounts).innerJoin(players, eq(players.id, riotAccounts.playerId)).where(and(usable, eq(players.teamMember, true), isNull(players.archivedAt)));
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
 * account it has not indexed yet. `tagLengths`: the places whose tag is outside 2–5 characters, by
 * server, length and kind ("na1 1 digits"), and `shortTags` what those tags are (shortTagEvidence).
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
        const shape = `${r.platform} ${tagShape(r.name!.split("#")[1]!.trim().normalize("NFC"))}`;
        tagLengths[shape] = (tagLengths[shape] ?? 0) + n;
      }
    }
  }
  return { windowDays: 30, places, removed, teamMembers, linked, notLinked, tagLengths, shortTags: await shortTagEvidence(db, since), recordedNamesNowAccepted, renamedSinceGame };
}

/** A tag without the tag: its length as Riot counts characters, and digits, Latin or another script ("2 latin"). */
function tagShape(tag: string): string {
  return `${charactersIn(tag)} ${/^[0-9]+$/.test(tag) ? "digits" : /^[A-Za-z0-9]+$/.test(tag) ? "latin" : "other"}`;
}

/**
 * Whether the tags outside 2–5 characters are Riot IDs as they are or shortened ones (counts only).
 * `linkedAccountsCheckedByRiot`: the linked accounts whose Riot ID Riot's account record has
 * confirmed (re-read by PUUID about daily), by tag: a short one there comes from Riot itself.
 * `players`: the players seen with a short tag in the window's games, by server and tag; then
 * whether each recorded that tag in every game, also a longer tag starting with it (the short one
 * cut off), or another tag (a rename), and, for those with a linked account, whether its confirmed
 * tag is the short one. `distinctTags` and `mostCommonTagPlayers`: one tag held by most of them
 * would be one Riot gives, many different ones tags people chose.
 */
async function shortTagEvidence(db: Db, since: number) {
  const linkedAccountsCheckedByRiot: Record<string, number> = {};
  const accounts = rowsOf<{ tag_line: string }>(
    await db.execute(sql`SELECT tag_line FROM riot_accounts WHERE owner_type = 'player' AND riot_id_checked_at IS NOT NULL AND label <> 'demo' AND sync_status <> 'demo'`),
  );
  for (const a of accounts) {
    const tag = a.tag_line.trim().normalize("NFC");
    const key = tagProblem(tag) === "tag-length" ? tagShape(tag) : (tagProblem(tag) ?? "2-5");
    linkedAccountsCheckedByRiot[key] = (linkedAccountsCheckedByRiot[key] ?? 0) + 1;
  }
  // Only players with a tag that may be short (ASCII outside 2–5, or any other script) leave the database.
  const rows = rowsOf<{ platform: string; tags: string[]; account_tag: string | null }>(
    await db.execute(sql`
      WITH p AS (
        SELECT x->>'puuid' AS puuid, split_part(x->>'name', '#', 2) AS tag, lower(split_part(d.match_id, '_', 1)) AS platform
        FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) x
        WHERE d.game_creation >= ${since} AND d.match_id ~ '^[A-Z]+[0-9]*_[0-9]+$' AND coalesce(x->>'removed', '') <> 'true'
          AND coalesce(x->>'puuid', '') <> '' AND strpos(coalesce(x->>'name', ''), '#') > 0)
      SELECT min(p.platform) AS platform, json_agg(DISTINCT p.tag) AS tags,
        (SELECT a.tag_line FROM riot_accounts a WHERE a.puuid = p.puuid AND a.owner_type = 'player' AND a.riot_id_checked_at IS NOT NULL AND a.label <> 'demo' AND a.sync_status <> 'demo' LIMIT 1) AS account_tag
      FROM p GROUP BY p.puuid
      HAVING bool_or(char_length(btrim(p.tag)) NOT BETWEEN 2 AND 5 OR btrim(p.tag) !~ '^[A-Za-z0-9]+$')`),
  );
  const players: Record<string, number> = {};
  const recorded = { sameTagInEveryGame: 0, alsoLongerTagStartingWithIt: 0, alsoAnotherTag: 0 };
  const linkedAccount = { sameShortTag: 0, anotherTag: 0 };
  const holders = new Map<string, number>();
  for (const r of rows) {
    const tags = [...new Set(r.tags.map((t) => t.trim().normalize("NFC").toLowerCase()))];
    const short = tags.filter((t) => tagProblem(t) === "tag-length");
    if (!short.length) continue;
    for (const t of short) {
      players[`${r.platform} ${tagShape(t)}`] = (players[`${r.platform} ${tagShape(t)}`] ?? 0) + 1;
      holders.set(t, (holders.get(t) ?? 0) + 1);
    }
    if (tags.length === 1) recorded.sameTagInEveryGame++;
    else if (tags.some((t) => short.some((s) => t !== s && t.startsWith(s)))) recorded.alsoLongerTagStartingWithIt++;
    else recorded.alsoAnotherTag++;
    if (r.account_tag != null) linkedAccount[short.includes(r.account_tag.trim().normalize("NFC").toLowerCase()) ? "sameShortTag" : "anotherTag"]++;
  }
  return { linkedAccountsCheckedByRiot, players, recorded, linkedAccount, distinctTags: holders.size, mostCommonTagPlayers: Math.max(0, ...holders.values()) };
}
