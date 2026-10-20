# Clash Scout

**Clash Scout** (`/clash`, a saved scout at `/clash/<id>`): its own entry in the sidebar and the phone menu, right below Team, and the phone tab bar's **Clash**. Team members only (`view-team`);
never on the public page.

A member pastes, drops or chooses Clash's two scouting screenshots (the **ranked** screen and the
**mastery** screen, in either order). They are read in the browser, and five opponent cards show
each player's name, rank, ranked champions (win rate, games, KDA), mastery, whether the account is
verified, and a way to look the player up. A card opens the player in full for checking,
correcting and verifying. **Save scout** keeps it in the team's history.

## What is stored where

| | Where | Kept |
|---|---|---|
| Screenshots | Only in the page's memory while it is read | Never stored, never uploaded |
| Name crops (a small picture of an unsure name) | Page memory | Gone on reload |
| Unsaved scout (draft) | This browser's `localStorage` (`uniiverse.clash-scout.draft.v1`): values and the screenshots' SHA-256 hashes, never an image | Until saved or discarded |
| Saved scout | `clash_scouts` (one row per scout: a validated JSON snapshot of a few kB) and `clash_scout_accounts` (verified PUUIDs only) | Until the Owner deletes it |

Pasting does not touch the database. A saved scout is a historical snapshot: it is never refreshed
from newer data. Both tables have Row Level Security on with no policies (only the app's own
database role reaches them), and every query takes the team id (`src/server/clash/scouts.ts`), so
another team's scout id reads as not found.

## Recognition (`src/domain/clash-scout/*`, `src/components/clash/recognizer.ts`)

All of it runs in the browser, loaded only when the first screenshot is pasted:

1. **Text**: [Tesseract.js](https://github.com/naptha/tesseract.js) 7 (Apache-2.0, WebAssembly, free).
   Its worker, core and language models are downloaded from the jsDelivr CDN the first time and
   cached by the browser: English (2.9 MB compressed) always; Russian, Korean, Japanese and Simplified
   Chinese (1.6–2.6 MB each) only when a name needs them. The screenshot itself never leaves the device; the CDN sees only
   the download requests.
2. **Layout** (`layout.ts`): the words are grouped into lines; the header (above the first
   portrait) holds the opponent's name (its tallest line that is not a label); the body is split
   into five equal columns. In each column the name is the first line that is neither a label nor a
   figure, the rank is the line that reads as one, and each champion row is the text beside a
   portrait. Nothing depends on pixel positions, so any resolution works.
3. **Figures** (`text.ts`) are read only from text that clearly is one: `%` for a win rate, `games`
   or `W/L` for games, `KDA` or `:1` for KDA, `LP` for league points, `Mastery N` / `Lv` for a
   level and grouped digits or `pts` / `K` / `M` for points. Anything ambiguous stays empty. OCR's
   usual division confusions (`|`, `l`, `1` for `I`) are normalised.
4. **Names** (`recognize.ts`): each name is read again on its own, enlarged. When English is not
   confident (< 90), the Cyrillic, Korean, Japanese and Chinese models are tried and the reading
   kept is the most confident one, counting the support of readings that agree with it. Names are
   only tidied (Unicode NFC, surrounding punctuation, the spaces OCR puts between CJK characters);
   letters are never changed. A name below 85 confidence is marked **Check name** and shown with a
   crop of the screenshot beside it.
5. **Champions** (`icons.ts`, `champion-print.ts`): portraits are found as busy, roughly square
   regions of a typical size, then compared with **champion prints**: a 12×12 colour print of the
   centre of every champion's Data Dragon portrait, built on the server once per patch from
   Data Dragon (`/api/clash/champion-prints`, members only, cached a year by the browser, about
   100 KB). A champion is accepted only above a 0.8 correlation and 0.06 ahead of the next best;
   otherwise it stays unknown ("to check"). Without a real Data Dragon version (offline fixture),
   champions are picked by hand.
6. **Pairing the two screens** (`merge.ts`): both list the same five players in the same order;
   when both screens' names were read and pair better in another order, that order is used. A name
   the two screens disagree on keeps the first reading and is flagged. Replacing one screenshot
   replaces only its own data; anything a member typed is never overwritten. The same file pasted
   twice is recognised by its hash and not read again.

### How well it works (measured, not assumed)

`tests/clash/recognition.test.ts` runs the real pipeline with real Tesseract (the same engine and
models) on synthetic Clash screens made by `scripts/clash-scout-fixtures.mjs` (five panels, names
in Cyrillic, Hangul, Japanese, Chinese and Latin, at 1600 and 1280 px, 173 champion prints):

- All names in other scripts, the opponent's name, ranks, win rates, games and mastery come out
  exactly at both sizes. Champions are recognised except where two synthetic portraits are near
  twins (then left unknown, never wrong).
- KDA can lose its decimal point at small sizes (then left empty).
- Latin `x`/`X` can be read either way (they differ only in size): the test accepts that case
  difference, and verifying the account replaces the reading with Riot's spelling.

These are synthetic screenshots, not real client captures (real ones show real players and are
not committed). Real client fonts, effects or a changed Clash layout can read worse; that is why
every value can be corrected in place, and why unsure readings are marked rather than trusted.
This test is local only (about 20 s; `pnpm vitest run tests/clash`); CI runs the fast logic tests in
`src/domain/clash-scout/clash-scout.test.ts`.

## Finding the account: OP.GG and Riot IDs (`links.ts`, `verifyOpponentAction`)

- Clash's scouting screens show names, not tags. A name alone can belong to several accounts, so
  **no profile is linked from a name and no tag is ever guessed.**
- Unverified: **Copy** copies the name exactly (any script); **Search on OP.GG** copies it and opens
  OP.GG's Multi-Search, where it is pasted (OP.GG documents Multi-Search as a paste box and no
  link format that pre-fills it). **OP.GG Multi-Search** above the cards copies all five names
  (verified Riot IDs where known), comma separated.
- Verified: a member types the full Riot ID (`Name#TAG`, e.g. from OP.GG or the client) and
  **Check with Riot** asks Riot's ACCOUNT-V1 API whether that exact account exists
  (`accountByRiotId`, the app's server key, at most one check every 2 s and 40 an hour per member).
  Only then does the player show **Verified**, the name becomes Riot's spelling, and a direct
  OP.GG profile link (`op.gg/lol/summoners/<region>/<name>-<tag>`) appears. The server signs each
  verification (HMAC over team, server, Riot ID and PUUID); saving keeps "verified" only with a
  valid signature or when it was already verified in the stored scout, so a browser cannot save an
  invented verification. Changing the name or the opponents' server, or **Not this account**,
  makes the player unverified again.
- **Seen before**: an account the team saved in an earlier scout is recognised by Riot's account
  id (PUUID) only, never by a similar name, and links to those scouts.
- **Games against these accounts** (saved scouts): the team's own stored games from a day before
  the scout to a week after in which at least two of the scout's verified accounts played on the
  other side. No match is registered by hand and nothing is assumed from the scout alone.

### Riot policy notes

- Riot's developer policy says products may not de-anonymize players who cannot reasonably be
  identified from visible information, nor expose a player's historic Riot IDs. Clash Scout uses
  only what the screenshots show plus a Riot ID a member supplies; it never searches for accounts
  behind a hidden name, and "Seen before" shows the earlier scout (opponent and date), not an
  older Riot ID.
- Verification uses the existing server key and the existing ACCOUNT-V1 call; no new Riot API is
  used and nothing is fetched in the background.

## Release status and Riot registration

**Status: released on the owner's decision (20 Oct 2026), team members only.** The owner updates
the product's registration on Riot's Developer Portal with the text below. Updating it is a
submission, not an approval: if Riot asks for Clash Scout to change or stop, switch it off first.

**Switching it off (no code change):** set `UNIIVERSE_CLASH_SCOUT=off` in Vercel (Project →
Settings → Environment Variables, Production), then redeploy. The Team tab disappears, its pages
answer Not Found and every Clash action is refused; saved scouts stay stored. Remove the variable
and redeploy to switch it back on.

The owner updates it at developer.riotgames.com → the product's page (a Personal or Production key
for an existing product is updated the same way). Paste the fields below, adjusting the URL.

**Product name:** UNIIVERSE (private team hub)

**Product URL:** the team's deployment (sign-in required; the public page shows no Riot data)

**Product description:**

> UNIIVERSE is a private web app for one amateur League of Legends team (about ten members). Members
> link their own Riot accounts; the app reads their ranked history, ranks and champion mastery to
> show team statistics, match history and a lineup overview. Only team members can sign in; there
> is no public sign-up, no payment, no advertising and no data resale.
>
> Clash Scout (team members only) helps the team prepare for a Clash match. A member pastes the two
> scouting screenshots the League client shows for the opposing team. The screenshots are read in
> the member's own browser and are never uploaded or stored. The page shows what the screenshots
> show (names, ranks, champion figures). A player is linked to an account only when a member types
> that player's full Riot ID (Name#TAG, for example from the opponent's public OP.GG page) and the
> app confirms with ACCOUNT-V1 that this exact account exists. No tag is guessed and no account is
> searched for behind a name. Saved scouts are visible to the team only and can be deleted by the
> team owner.

**APIs used:**
- ACCOUNT-V1 (`/riot/account/v1/accounts/by-riot-id`): resolve a Riot ID a member typed (their
  own accounts at linking; an opponent's for Clash Scout verification, at most one check every
  2 seconds and 40 an hour per member, never in the background).
- MATCH-V5 (match ids, matches, timelines): members' own linked accounts only.
- LEAGUE-V4 (entries by PUUID): members' own linked accounts.
- CHAMPION-MASTERY-V4: members' own linked accounts.
- LOL-STATUS-V4: a key health check.

**Data storage and retention:**
- Members' games, ranks and mastery: kept while the account is linked; unlinking deletes them.
- Clash Scout: a saved scout stores the values read from the screenshots and the PUUIDs of
  accounts a member verified; it is deleted when the team owner deletes the scout. Screenshots
  are never stored.
- PUUIDs are internal identifiers only and are never displayed.

**Policy points the reviewer may ask about:**
- No live-game data, no Spectator API, no League Client (LCU) integration, no automation of
  picks or bans.
- No de-anonymisation: only what the client's own Clash screen shows, plus a Riot ID the team
  supplies and Riot confirms.
- No historic Riot IDs are shown: an account seen in an earlier scout is matched by PUUID on the
  server, and the page names the earlier scout (opponent and date), not an older Riot ID.
- No public access: Clash Scout and all Riot data are behind sign-in for the team's members.
- Riot's notice ("UNIIVERSE isn't endorsed by Riot Games…") is shown in the app.

**Screenshots to attach:** the Clash Scout workspace with demo data (from the in-memory demo,
which uses synthetic names, never real players' screenshots).

## Permissions (`src/server/clash/access.ts`; checked again in every server action)

| | Member (`view-team`) | Team Lineup Manager (`manage-lineup`) | Owner (Team Leader) |
|---|---|---|---|
| Scout, save, read the history, open links | ✓ | ✓ | ✓ |
| Edit a saved scout | their own | any | any |
| Archive / restore | | ✓ | ✓ |
| Delete permanently | | | ✓ |

Personal-use accounts (not team members) have none of these. Concurrent edits are guarded by the
scout's `updated_at` (a stale save is refused with "Someone else changed this scout meanwhile").

## Cost and performance

- No paid service. Tesseract and its models are open source and served by jsDelivr's free CDN.
- Database: one insert (or update) per save, plus up to five rows of verified accounts; the history
  list reads summary columns only (no snapshot), searched with `strpos` on a lower-cased column.
  The games-against query sends only matches that contain a scouted account.
- Server: the champion prints are built once per patch per server instance (about 170 small
  Data Dragon downloads, kept in memory for a day), and the browser keeps them for a year.

## Out of scope (by design)

No draft simulation, pick/ban recommendations, ban rankings, threat scores or dashboards.

## Browser tests

`e2e/clash-scout.spec.ts` uses a stand-in recogniser (`UNIIVERSE_FAKE_SCOUT_OCR=1`, in-memory demo
only, set in `playwright.config.ts`) so CI does not download Tesseract; it tests the workspace:
reading, the draft surviving a reload without being saved, replacing a screenshot, pasting,
correcting, verifying (the in-memory demo's stand-in Riot client), OP.GG links, saving, the history
and its search, permissions, and phone and desktop layouts.
