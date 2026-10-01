# Riot Games compliance checklist

UNIIVERSE uses Riot Games data in two ways: **Data Dragon** (public static files: champions, patches, portraits) and the **Riot Games API** (ranked matches for statistics, and the ranked history, mastery and tier of accounts a team member linked on purpose). This page lists what Riot's policies require and how the app meets each point. Re-read it whenever you change what data is collected or shown.

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
| Do not hammer the API | Ingestion is incremental (per-account cursors, match-id queue, "already stored" skips); account sync runs every few hours, not continuously. | `src/server/ingestion/*`, `src/server/accounts/sync.ts` |

Endpoints used: `account-v1` (Riot ID → PUUID), `match-v5` (match ids and matches), `league-v4` (ranked entries), `champion-mastery-v4` (masteries), `league-exp/v4` or league lists for high-Elo discovery. Nothing else.

## Data collection and use

| Requirement | How UNIIVERSE meets it |
| --- | --- |
| Only collect what the product needs | Ranked matches are reduced to champions, roles, bans, duration and result; opponent accounts are reduced to per-champion/role counts, rank snapshot and mastery. Full match payloads are not stored. |
| No commercial use of Riot data without approval | UNIIVERSE is a private team tool with no payments, ads or resale of data. |
| Do not de-anonymise players or reveal hidden identities | The app never tries to connect Riot IDs to real names, never searches third-party sites, and shows opponent data only for accounts someone entered by hand. The scouting UI says so explicitly. |
| Honour deletion | Unlinking an account deletes its history, mastery and ledger rows (`removeAccount`). Deleting an opponent player removes their accounts. |
| Keep PUUIDs internal | PUUIDs are stored for de-duplication only and never displayed; Riot IDs (gameName#tagLine) are the shown identifier, exactly as entered (full Unicode). |
| Attribute Data Dragon | Champion portraits are served from Data Dragon URLs; the app does not mirror or rehost the images. |

## Things the app deliberately does NOT do

- No League Client (LCU) integration, no reading of the live game client, no automatic picks or bans.
- No scraping of op.gg-style sites; professional data comes from Leaguepedia's public Cargo API or an Oracle's Elixir CSV you supply, each with its own terms.
- No sharing of collected data outside the team: there is no public page and every page is behind the team's accounts.

## Before you register a production key

1. Confirm the required notice is visible (sidebar and Settings).
2. Make sure `RIOT_API_KEY` is only set in the host's environment variables, never in the repository.
3. Describe the product honestly: "private drafting assistant for one amateur team; reads ranked match history of consenting team members and publicly visible ranked data of opponents entered by hand; stores aggregated champion statistics".
4. Keep this file and the Settings compliance panel in sync with reality when features change.
