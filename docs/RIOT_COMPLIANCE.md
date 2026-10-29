# Riot Games compliance checklist

UNIIVERSE uses Riot Games data in two ways: **Data Dragon** (public static files: champions, patches, portraits) and the **Riot Games API** (ranked matches for statistics, the ranked history, mastery and tier of accounts a team member linked on purpose, and the current rank of the other players in a completed match a member opens). This page lists what Riot's policies require and how the app meets each point. Re-read it whenever you change what data is collected or shown.

The authoritative sources are Riot's Developer Portal policies (https://developer.riotgames.com/policies/general) and the Legal Jibber Jabber (https://www.riotgames.com/en/legal). If anything here disagrees with those pages, the pages win.

## Required notice

Riot requires products using its IP to show the following text. It is shown in the app sidebar ("Not endorsed by Riot Games" → Details) and in Settings → Riot Games compliance:

> UNIIVERSE isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## API key handling

| Requirement | How UNIIVERSE meets it | Where |
| --- | --- | --- |
| Keep the key secret; never ship it to clients | The key is read from `RIOT_API_KEY` on the server only. No route returns it; no client bundle references it. Settings shows only "set / missing". | `src/server/riot/api/client.ts`, `src/app/(app)/settings/page.tsx` |
| Register the product; use a Personal/Production key for a persistent product | Documented in DEPLOYMENT.md (development keys expire daily). Register UNIIVERSE as a private team tool and describe exactly the endpoints below. | `docs/DEPLOYMENT.md` |
| Respect rate limits and back off on 429 | The client enforces the configured app limits (`RIOT_RATE_LIMITS`), honours `Retry-After` on 429, and jobs stop when the time budget is spent. | `src/server/riot/api/client.ts`, `src/server/jobs/*` |
| Do not hammer the API | Account sync is incremental (per-account cursors, "already stored" skips), most urgent accounts first, within a time budget per run. | `src/server/accounts/sync.ts` |

Endpoints used: `account-v1` (Riot ID → PUUID), `match-v5` (match ids, matches and timelines), `league-v4` (ranked entries: linked accounts, and the players of a completed match a member opens; see Ranks in completed matches), `champion-mastery-v4` (masteries), `lol-status-v4` (the key check). Nothing else.

## Data collection and use

| Requirement | How UNIIVERSE meets it |
| --- | --- |
| Only collect what the product needs | Ranked matches are reduced to champions, roles, bans, duration and result; opponent accounts are reduced to per-champion/role counts, rank snapshot and mastery. Full match payloads are not stored. Other players in members' completed matches: their current Ranked Solo/Duo and Flex entries (tier, division, LP) and when they were read, one row per player, replaced by the next check. |
| No commercial use of Riot data without approval | UNIIVERSE is a private team tool with no payments, ads or resale of data. |
| Do not de-anonymise players or reveal hidden identities | The app never tries to connect Riot IDs to real names, never searches or queries third-party sites, and collects nothing about opposing players beyond the completed matches of linked accounts and, for the players of a match a member opens, their current rank (Ranks in completed matches, below). Outbound links to OP.GG (below) carry only a Riot ID Riot already recorded in a completed match. |
| Honour deletion | Unlinking an account deletes its history, mastery and ledger rows (`removeAccount`). Deleting an opponent player removes their accounts. |
| Keep PUUIDs internal | PUUIDs are stored for de-duplication only and never displayed; Riot IDs (gameName#tagLine) are the shown identifier, exactly as entered (full Unicode). |
| Attribute Data Dragon | Champion portraits are served from Data Dragon URLs; the app does not mirror or rehost the images. |

## Player links in completed matches

In a player's Match History, Team → Matches and the match window, each name in a completed game links somewhere:
- **UNIIVERSE members** (an active profile with that linked Riot account) link to their UNIIVERSE profile. Since 26 October 2026 a small separate link beside the name opens their OP.GG profile too, for a mouse and the keyboard (on a touch screen it would be too small a target beside the name, so it is not drawn there; their profile's Riot Accounts tab has it).
- **Everyone else** links to their public OP.GG profile, in a new tab, when the stored match allows it: the Riot ID Riot recorded in Match-V5 (`Name#TAG`) and the server in the match id (`OC1_…` → `oce`).
- **The newest Riot ID UNIIVERSE already holds wins** (`src/server/players/riot-names.ts`), by PUUID: a linked account's (the account sync keeps it current), on its server once Riot has confirmed that server (until then, the match's own); otherwise the newest full Riot ID from a later stored game. A player who renamed is linked by their newer name, never by a guess. A record without a tag, and a demo game's made-up name, never count.
- **Otherwise the name is plain text.** That covers a name that is not a well-formed Riot ID, a server OP.GG does not list, and demo games. The data audit counts these places by reason (`data-audit` → `opggLinks`, counts only).

The rules (`src/domain/opgg.ts`, unit tested with real-world Riot IDs):

| Rule | Why |
| --- | --- |
| Only data already stored from completed matches; no Riot request, no OP.GG request, no lookup of any kind | No new API use. The registered endpoint list above is unchanged, so no product re-registration or portal change is needed. |
| Only post-game data. Riot's 2025 anonymity changes (Streamer Mode) hide identities in live games and explicitly leave post-match APIs such as Match-V5 unaffected. | A link reveals nothing Riot has not already published for that completed game. Nothing hidden is identified. |
| A plain hyperlink: the browser navigates; UNIIVERSE sends OP.GG no data. `rel="noopener noreferrer"` means OP.GG does not even learn which UNIIVERSE page linked to it. | UNIIVERSE is not a data broker between the Riot API and a third party. |
| No live game, no Spectator API, no opponent scouting | Out of scope by decision (see the Live Game feasibility notes in the handover). Post-game possible groups are below. |

**Why this is allowed.** The earlier line "never searches third-party sites" (above) and "No scraping of op.gg-style sites" (below) were UNIIVERSE design decisions about *collecting* data. They were not Riot requirements, and an outbound link collects nothing. Riot's policies (developer portal, last read through public excerpts in October 2026) restrict de-anonymising players, using live information not in the client for a competitive edge, and acting as a data broker. None of these applies to a link built from a completed match's recorded Riot ID. OP.GG is itself a long-standing Riot API product.

**OP.GG region slugs.** `na`, `euw`, `kr`, `lan`, `las`, `ru`, `br` and `vn` were checked against live OP.GG profile addresses. `oce`, `eune`, `jp`, `tr`, `me`, `sg`, `ph`, `th` and `tw` follow OP.GG's region list. A wrong slug would only open OP.GG's own "not found" page.

**A player's history on OP.GG (October 2026).** A game's breakdown (under its Match History card, or in the match window; for the account that played the game) also offers **"View Match History on OP.GG"**, built the same way from the member's own linked Riot ID and server. Match History's header offered the same link until 23 October 2026; it was removed as redundant with the match window's. OP.GG has no documented address for a single game that can be built from Riot's match id, so UNIIVERSE never links "to the game": the label always says it is the player's history. Demo games have no real match id and get no link.

## Social links (YouTube, Twitch, Discord)

Members may add their own YouTube channel, Twitch channel and Discord username (`src/domain/social-links.ts`). This is not Riot data and uses no Riot API. Reviewed in October 2026 against what each service publishes (read through public pages and excerpts; this is not a legal assessment):

| Service | What UNIIVERSE does | Notes from the service's published guidance |
| --- | --- | --- |
| Riot Games | Nothing changes in what is collected from Riot or shown from Riot data; the public page still shows no rank, statistic, Riot ID or match. | The links are entered by the member, so no Riot policy on API data applies to them. |
| YouTube | A plain link to the member's own youtube.com channel (`@handle` or channel address only), with the word "YouTube" and a generic play symbol. No YouTube logo, API, embed or feed. | YouTube's brand resources allow its icon only as an unaltered link to a YouTube channel and ask for approval for other brand uses; UNIIVERSE uses no YouTube artwork at all. No YouTube API Services are used, so their terms do not apply. |
| Twitch | A plain link to the member's own twitch.tv channel, with the word "Twitch" and a generic screen symbol. No Glitch logo, API, embed or live status. | Twitch publishes its brand rules at twitch.tv/p/brand; UNIIVERSE uses none of its assets and implies no endorsement. No Twitch API is used. |
| Discord | The username as text with a copy button (Discord has no public address for a username), with the word "Discord" and a generic speech-bubble symbol. No Clyde logo, OAuth, invite, widget or bot. | Discord's brand page says its logos and trademarks need permission except as its guidelines allow; UNIIVERSE uses none of its artwork. No Discord API is used. |

- **Opt-in per link.** Each link has its own audience: Only me (the default), team members, or also the public team page. A link appears only where its owner chose, and only while its value still passes the checks; a stored value alone never shows anything (`visibleSocialLinks`, pinned by `tests/db/public-access.test.ts` and `e2e/social-cards.spec.ts`).
- **No verification badge.** UNIIVERSE does not check that a channel belongs to the member; nothing on the page claims it does.
- **Outbound only.** Links open in a new tab with `noopener noreferrer nofollow`; UNIIVERSE requests nothing from these services.
- **Removal.** The member clears a field to remove it; deleting an account clears all of them. The privacy notice lists them.

## Possible groups in completed matches

A game's scoreboard (under its Match History card, or in the match window from Team → Matches) can mark players outside UNIIVERSE on one team who may have queued together, for example "Possible trio · These three players appeared on the same team in four previous recorded games." It is a post-game, historical inference from data UNIIVERSE already stores:

| Rule | Where |
| --- | --- |
| Only completed matches already stored (the full records kept for linked accounts' games). No Riot request, no new data stored, no new table, no OP.GG or any other site. The registered endpoint list above is unchanged. | `src/server/matches/possible-groups.ts` |
| Players are matched by their Riot account (PUUID), never by name, champion or rank. PUUIDs stay on the server; the page gets scoreboard positions, counts, dates, queues and results. | same |
| No earlier Riot ID is ever shown. A group is named with the names recorded in the analysed match only, so a player who renamed is not exposed. (Riot: "Products may not expose a player's historic Riot IDs".) | same |
| A player without a recorded Riot ID in the analysed match is never assessed. Nor is anyone whose Riot account is linked to a UNIIVERSE profile (October 2026): members are never labelled; their games together are Played Together, a fact, not an inference. | `src/domain/possible-groups.ts`, `src/server/matches/possible-groups.ts` |
| Evidence: the games of the 180 days before the analysed match (never the match itself, never a later game) in which every player of the group was on the same team. At least 3 such games, and at least three times as many as games in which they were all present but on opposite teams. | same |
| Queue party sizes: Solo/Duo duos only; Flex 2, 3 or 5; normal draft, blind, ARAM, Quickplay and Swiftplay up to 5; Clash is stated as a registered team of five (nothing inferred); any other queue is not assessed. A player is in one group at most; two overlapping groups with equal support are both left out. | same |
| Wording: "Possible duo / trio / four-player / five-player group", "These N players appeared on the same team in N previous recorded games.", never "premade" and never a percentage. Without a group: "not enough recorded history to assess"; a side made up of members: "no other players to assess". The note under the scoreboard says how many stored games were searched and that it is an inference, not confirmed parties. | `src/components/match-history/match-detail.tsx` |
| Loaded only when a game is opened, after the scoreboard (a second request; never during the Match History list), cached per match on the server for 30 minutes and per list in the browser. | same |

**Why this is allowed without a portal change.** It is analysis of completed matches already collected for the registered purpose (consenting members' match history), shown only to signed-in team members. It uses no live information, so it cannot give an in-game edge, and Riot's anonymity changes (Streamer Mode) explicitly leave post-match data unaffected. It identifies nobody who is hidden: it only relates Riot IDs that Riot published for that completed game, and only through games the team itself played in.

**Considered and not built: a Match-V5 sample of every participant's history.** Fetching each participant's recent match ids (`/lol/match/v5/matches/by-puuid/{puuid}/ids`, up to 9 requests per match) and the details of shared matches (up to about 10 more) would find groups among players who never met a member before. It is not built, because:
1. It collects the match history of non-consenting players who were not entered by hand, which the product description registered with Riot (see "Before you register a production key") does not cover. It needs the owner to update the registration first.
2. At 10–20 requests per opened match on the regional host (`sea` for OC1) that account sync and match collection share, with a Personal key's 100 requests per 2 minutes, a few opened matches would use most of the ingestion budget.
3. Without it, stored history still covers the useful case: groups that repeatedly play with or against a member.

If the owner updates the registration, the design above (bounded 20-id samples, intersection by team, stored records reused, a separate low-priority rate share) is the natural extension.

## Encounters in a player's profile

A profile's Match History → Encounters lists the other players that player met in their own recorded games, as opponents or allies, with the player's record in those games. (Until 21 Oct 2026 it was a team list under Team → Matches.)

| Rule | Why |
| --- | --- |
| Stored completed matches only (`account_matches` and the stored Match-V5 participants); no Riot request, no OP.GG request, no polling | No new API use and no change to the registered endpoints. |
| Only players already in the player's completed games; nobody is looked up, followed or added to a list by hand | Nothing beyond what Riot published for those games is shown, and no one is tracked outside them. |
| Players are recognised by PUUID on the server; the page gets an opaque key, never the PUUID, and the shown Riot ID is the latest one recorded | PUUIDs stay internal. |
| Wording describes games only ("played alongside", "faced"); never premade, friend, duo partner or "counter" | A shared game is not evidence of a party or a relationship. |
| Behind the same permission as the profile's Match History (your own, or teammates' statistics), on the team's private pages, never on the public page | No sharing outside the team. |

## Ranks in completed matches

Every game's scoreboard (Match History, Encounters, Matchups and Team → Matches) shows a small badge beside each player: their Ranked Solo/Duo or Flex rank, with when it was read against the game, "Unranked" when Riot listed no ranked entry, or "—" when nothing is known. Riot's match records (Match-V5) hold no rank, so each rank is a reading: a member's last rank recorded before the game by their own sync (rank history), or another player's rank checked within a day after the game (the checks made when a game is collected). A rank read later, or before the game, carries a clock and says it is the player's rank then, not at the time of the game; the note under the scoreboard says which kind the ranks are, and its (i) the rules (29 Oct 2026; before, every badge was a current or last-checked rank).

| Rule | Where |
| --- | --- |
| Stored ranks first: a linked account's last sync, and `last_known_ranks` for everyone else (earlier checks, and the Solo/Duo tiers the retired Draft scouting and ranked ladder saw). | `src/server/players/participant-ranks.ts` |
| Riot is asked about the players of members' games only, at two moments: once a game of the last 7 days is collected, for its players with no check since it ended (the `rank-checks` job of the scheduler tick, 30 a run, newest game first); and when a member opens a match, for its players with no check in the last 3 days (or none since a game of the last 7 days). LEAGUE-V4 `/lol/league/v4/entries/by-puuid/{puuid}`, one request each, on the match's server. Members are never asked about this way (their sync reads them). No list, page or search looks anyone up; nobody outside the members' games is checked, and no player is followed: a player is checked again only for another game with a member, or when one of their games is opened and the reading is over three days old. | same |
| Limits: 1,000 checks in any 24 hours across the site, of which the checks after collection may use 600 (opened matches keep the rest); at most half of each rate-limit window of that server, and never a wait (a request with no free slot is skipped, and the window says so); no retries and a 4-second timeout; a player whose check failed is not asked again on that server instance for 30 minutes, or for a day when Riot cannot read their PUUID with the current key (400, as for games stored under an earlier key); a rejected key stops every check for 10 minutes. Account sync keeps the other half of the limits. | same |
| Stored: one row per player (PUUID, tier, division and LP per queue, when, source "match lookup"), replaced by the next check, and only while the player is still in the stored match. Erased people are never asked about (the erasure filter), and permanent erasure deletes their row. | same; `docs/PRIVACY.md` |
| Shown to signed-in members with the right to that Match History (their own, or teammates' statistics), on the team's private pages only. PUUIDs stay on the server; the page gets the badge's queue, tier, division, LP and date by scoreboard position. Never on the public pages. | `src/server/actions/match-history.ts` |
| Wording: "Gold 2", with "Flex" or "Solo" when the rank is from the other ranked queue than the game's, the month once a rank is over 30 days old, and on hover "Ranked Solo/Duo: Gold II, 45 LP, checked 40 min after this game", "… the last rank recorded before this game", or, with a clock, "… checked 20 Oct 2026, 9 days after this game: their rank then, not at the time of this game". "Unranked" only on a check's word; a rank never read is "—" ("Rank not available"), never "Unranked". | `src/domain/known-rank.ts`, `src/components/match-history/scoreboard.tsx` |

**Why this is allowed.** LEAGUE-V4 is already one of the registered endpoints, and the rank it returns is the one the League client shows on any player's profile, and Riot API products such as OP.GG show for anyone. It is read only for players in completed games a member played, after the game, so it gives no in-game edge and identifies nobody who is hidden. Riot's League policy has no opt-in rule for showing ranks (its opt-in rules cover custom-game history and VALORANT; read through public excerpts in October 2026, not a legal assessment).

**For the product registration.** The description registered with Riot (see "Before you register a production key") covers members' own match history. The owner should add this use the next time the registration is updated, for example: "shows the rank of the players in members' completed matches, checked once after each game is collected and again when a member opens a game whose reading is over three days old (up to 1,000 checks a day)". Nothing in the key or the app changes for it. The checks after collection (29 Oct 2026) use the same endpoint, for the same players and the same display as the checks on opening, made earlier so that every recent game shows its players' ranks.

**Players' ranks on the Match History cards (26 October 2026; teammates' too since 29 October).** Each collapsed game card shows the other players' ranks in a few letters ("E2", "GM"; "Unr" on a check's word that they are unranked; nothing when no rank was read), from what is already stored only: the same readings as the scoreboard, read with the page in five indexed queries. The list never asks Riot. Since 29 October the checks after collection give every game of the last 7 days its players' ranks around the game, whether or not anyone opened it; a rank read away from its game is written in the plain caption colour. The full statement (queue, rank, and when it was read against the game) is on hover and for screen readers. The same permissions as the scoreboard; never on the public pages.

**Match History 2.0 (29 October 2026).** A member's Match History opens a game under its card,
with a scoreboard, comparisons, the gold difference over the game and the build. No new endpoint
and no new kind of data: the comparisons are arithmetic on the stored records of that member's own
games (shares of the team, the lane opponent by recorded position, the member's own earlier games),
labelled with their sample and never turned into a score or a judgement of other players. The match
timeline (`match-v5`, already used for the build and Matchups) is requested once per game, only
when the member opens a section that needs it, and kept compactly (each player's gold, experience
and CS per frame, purchases, skill order and the times they took part in a champion kill; the
objectives each team took; erased players removed). Timelines kept before the kill times and
objectives were are requested once more, the same way, the next time one is opened. A 429 is shown
as Riot limiting requests; nothing retries in the background.

## Clash Scout (retired 23 Oct 2026)

Clash Scout, which read opponents' names and figures from Clash scouting screenshots, was removed
(`docs/CLASH_SCOUT.md`). The app no longer makes any request for it: no ACCOUNT-V1 lookup of an
opponent's Riot ID (by Riot ID or by PUUID), no CHAMPION-MASTERY-V4 request for any account that is
not a member's linked account, and no Testing Lab or `lab-benchmark` runs. The endpoints listed
above are all the app uses, for members' own linked accounts and the key check.

If the product's registration on Riot's Developer Portal still describes Clash Scout, the owner can
drop that paragraph and its API uses the next time the registration is updated; nothing in the app
depends on them. The scouts saved before the retirement stay in the database, shown nowhere, until
a held clean-up deletes them (`docs/DATA_PIPELINES.md`, "Retired tables").

## Things the app deliberately does NOT do

- No League Client (LCU) integration, no reading of the live game client, no automatic picks or bans.
- No scraping of, or API calls to, op.gg-style sites. (Plain outbound links to OP.GG profiles from completed matches are allowed: see Player links above.)
- No live-game (Spectator API) features, opponent scouting during a game, or pre-game or live premade detection. (Post-game possible groups from stored matches are allowed: see above.)
- No sharing of collected data outside the team. The public team page (`/public`) shows only what the team entered itself: display names, pictures, card styles, roles and champion pools, with Riot's static champion art. No Riot ID or match reaches it. Rank and statistics reach the public pages only where the deployment sets `UNIIVERSE_PUBLIC_RIOT_DATA=true`, which is meant only for a Production key whose registration describes the public pages: then the cards carry the figures members see, and `/public/leaderboards` ranks the players on the public page (nobody else on the team). Without it, that address is not found.

## Before you register a production key

1. Confirm the required notice is visible (sidebar and Settings).
2. Make sure `RIOT_API_KEY` is only set in the host's environment variables, never in the repository.
3. Describe the product honestly: "private team tool for one amateur team; reads the match history of consenting team members; stores their games and champion statistics; shows the current rank of the players in those games when a member opens one".
4. Keep this file and the Settings compliance panel in sync with reality when features change.
5. Riot checks that the product's address is yours by fetching a code from `/riot.txt`. It is `public/riot.txt` (the code alone, no newline), and `src/proxy.ts` lets it through without sign-in. If Riot issues a new code, replace the file.
