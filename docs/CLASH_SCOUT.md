# Clash Scout

**Clash Scout** (`/clash`, a saved scout at `/clash/<id>`): its own entry in the sidebar and the phone menu, right below Team, and the phone tab bar's **Clash**. Team members only (`view-team`);
never on the public page.

A member pastes, drops or chooses Clash's two scouting screenshots (the **ranked** screen and the
**mastery** screen, in either order). They are read in the browser, and five opponent cards show
each player's name (and where it came from), rank, total mastery, ranked champions (portrait, win
rate, games, KDA), mastery (portrait, points, level) and who the account is: **verified**, a
**possible match** to check, or **not identified**. A verified player's name links to their OP.GG
profile (new tab); **Open all 5 profiles** opens every verified player's profile, one tab each.
Everything is corrected in the card itself: the pencil opens its small editor (name, rank, figures,
rows), a champion's portrait opens the champion list. **Save scout** keeps it in the team's
history. The flow: paste → the five players are read → identify who is not yet → open the profiles.

## Getting screenshots in (`src/components/clash/shot-intake.tsx`, `use-screenshots.ts`)

- **Paste anywhere** on `/clash`: Ctrl+V (⌘V on a Mac), no file dialog. A paste meant for a text
  field (the focus is in a field and the clipboard holds text) is left to the field; an image
  alone is read wherever the focus is. **Drop** works anywhere on the page (an overlay says so
  while files are dragged). **Choose screenshots** opens the file picker (`image/*`, so phones
  offer their photos); where the browser can read images from the clipboard, a **Paste** button
  does too (touch screens).
- Each image gets a **tile** at once: a thumbnail held in the page only (an object URL), with what
  is happening to it ("Finding the five players", "Reading names"…). Images are read one after
  another, in the order they came. Text recognition starts downloading when a paste is likely
  (Ctrl or ⌘ pressed, the pointer over the panel, files dragged in), so the first reading starts
  sooner.
- **The same picture twice** (pasted again, or saved and dropped) is recognised from its pixels
  (`fingerprint` in `image.ts`) and not read again.
- Each screen has **one place**: a newer ranked screenshot replaces the earlier one (only the
  ranked readings change; the mastery ones and everything a member set stay). A tile's menu reads
  it again, reads it as the other screen ("It is the Mastery screen"), replaces it or removes it
  (removing takes out what it filled in, nothing else).
- The screen is told apart automatically; when it cannot be (nothing recognisable), the tile says
  so and offers **Read as Ranked** / **Read as Mastery**. A reading that fails (a blocked CDN)
  says so with **Try again**, and changes nothing that was already filled in.

## What is stored where

| | Where | Kept |
|---|---|---|
| Screenshots | Only in the page's memory while it is read | Never stored, never uploaded |
| Name crops (a small picture of an unsure name) | Page memory | Gone on reload |
| Unsaved scout (draft) | This browser's `localStorage` (`uniiverse.clash-scout.draft.v1`): values and the screenshots' pixel fingerprints, never an image | Until saved or discarded |
| Saved scout | `clash_scouts` (one row per scout: a validated JSON snapshot of a few kB) and `clash_scout_accounts` (verified PUUIDs only) | Until the Owner deletes it |

Besides the values shown, a scout keeps what each screenshot read as each name (`nameReads`: the
text and its confidence) so the two screenshots can be compared and a correction shows what it
replaced, how sure the rank's reading was (`rankCertainty`) and the total mastery. All of it is
optional in the schema, so scouts saved before it existed still read.

Pasting does not touch the database. A saved scout is a historical snapshot: it is never refreshed
from newer data. Both tables have Row Level Security on with no policies (only the app's own
database role reaches them), and every query takes the team id (`src/server/clash/scouts.ts`), so
another team's scout id reads as not found.

## Recognition (`src/domain/clash-scout/*`, `src/components/clash/recognizer.ts`)

All of it runs in the browser, loaded only when the first screenshot is read (the same code runs in
the tests in Node). Why it used to read the wrong names: it assumed a screenshot held nothing but
the five players. Real client screenshots also hold the client's top bar, the team's header, the
Clash schedule with its countdown ("4M 12S") and a friends list full of names, and the old layout
split the whole width into five and took the first name-like line of each fifth. The pipeline
below finds the client's own structure first and reads each field from exactly its place.

1. **Text**: [Tesseract.js](https://github.com/naptha/tesseract.js) 7 (Apache-2.0, WebAssembly, free).
   Its worker, core and language models are downloaded from the jsDelivr CDN the first time and
   cached by the browser: English (2.9 MB compressed) always; Russian, Korean, Japanese and Simplified
   Chinese (1.6–2.6 MB each) only when a name needs them. The screenshot itself never leaves the device; the CDN sees only
   the download requests.
2. **The five columns** (`grid.ts`): the client separates its five player columns with thin
   vertical lines, the most regular thing in the picture: four equally spaced lines running down
   most of its height. Finding them in the pixels gives the columns exactly, at any size, before
   any text is read; nothing outside them (friends list, schedule, top bar) can be a player.
   Without the lines (a re-coloured or heavily compressed image) the columns come from the
   figures' alignment.
3. **One reading of the whole panel** (`recognize.ts`, `layout.ts`): with the lines found, only the
   client's scouting panel is read, enlarged or reduced to the size a 1080p client's text has
   (Tesseract reads that size well), whatever the capture: a 1024×576 client, a 4K screen, or the
   client in a window on a larger desktop. That reading places the names' row (one name-shaped
   line per column, under the team's header), the champion rows, and tells the ranked screen from
   the mastery one. Words are grouped into lines by their own height, so a portrait read as a tall
   "word" cannot join two lines of figures.
4. **Every field again, from its own crop** (`image.ts`): each name, each rank, each column's
   figures, each total mastery and the team's name are cut out and cleaned for OCR (brightest
   channel, so gold, green and red text stay bright; contrast stretched; inverted to dark on
   white; enlarged to about 40 px; a white margin). A crop holds nothing but its field.
5. **Figures** (`text.ts`) are read only from text that clearly is one: `%` for a win rate, the
   bracketed count after it (`50% (2)`) or `games` / `W/L` for games, `KDA` for KDA, `LP`, `Lv`
   for a level (levels past 100 included) and `k` / `M` / grouped digits / `pts` for points. A
   figure never starts inside a word: `S0%` is a misread `50%`, not `0%`. Each champion row is
   read twice (its column's strip, and the whole panel) and the two are merged figure by figure:
   one reading or two agreeing stand; two that differ keep the one that kept its decimal point
   (`91.8 k` against `918 k`), else the strip's, and the row is marked for checking. The total
   mastery is read from above its caption (read on its own; together, Tesseract skips the large
   italic figures); two readings that differ leave it empty.
6. **Names** (`readName`): each name's crop is read in English; when that is not clearly a
   confident name, the Cyrillic, Korean, Japanese and Chinese models are tried. The reading kept
   is the one the others agree with most; readings that differ only in case or spaces keep the
   spelling most of them back. Names are only tidied (Unicode NFC, surrounding punctuation, the
   spaces OCR puts between CJK characters); letters are never changed or translated.
7. **Champions** (`recognize.ts`, `portraits.ts`, `champion-print.ts`): each row's portrait box is
   placed on the grid the portraits share (one x per column, from where the column's figures
   start; one y per row), and the portrait inside it is compared with **champion prints**: a 12×12
   colour print of the centre half of every champion's Data Dragon square, built on the server
   once per patch (`/api/clash/champion-prints?v=<patch>&f=<format>`, members only, cached a year by
   the browser, about 100 KB; the format is part of the address, so a cached print of an older
   kind is never compared).
   - **Why champions used to stay unknown:** the client does not draw the square as it is. It
     draws a round portrait zoomed into the square's centre, with a gold ring partly around it, a
     little right of and below the box's centre. The old comparison used the centre 68% of both
     pictures, and for 50 real portraits it never passed 0.76, under its 0.8 threshold, so every
     champion was left unknown. Compared at the client's zoom (the inner 55% of the round portrait
     against the centre 50% of the square), a correct champion scores 0.92–0.99 and the best wrong
     one at most 0.75.
   - **Measured on each screenshot:** where exactly the portrait sits in its box, and how large,
     differs a little between captures (scaled, compressed, a client in a window), so a few
     portraits are compared over a small range of positions and sizes and the geometry the clearly
     recognised ones agree on is used for all of them, each fine-tuned by a pixel or two (about
     0.3 s a screenshot).
   - **Three outcomes:** **recognised** (at least 0.85 and 0.15 ahead of the best other champion),
     **suggested** (at least 0.75 and 0.08 ahead: shown with a "?" and counted as to check, never as
     certain), or **unknown** (the member picks it). Nothing is assigned silently; a suggestion is
     not used as evidence for an identity until a member confirms it.
   - Each champion keeps its own figures: the portrait, win rate, games and KDA (or points and
     level) of a row are read from that row only. Champion ids come from Data Dragon itself
     (`MonkeyKing` for Wukong, `KSante`, `Belveth`), and the names shown are Data Dragon's
     (punctuation included).
8. **How sure each field is**: a name, a rank and each champion row carry their own certainty
   (`high`, `low`, or `manual` once a member set it). A row is sure when all its figures were read
   and its two readings agreed; its champion is shown apart.
9. **The two screens together** (`merge.ts`): both list the same five players in the same order
   (when both screens' names were read and pair better in another order, that order is used).
   Each screenshot's reading of each name is kept, and the name shown is decided from them: one
   reading of 85 or more is trusted; two that agree are trusted from 75 (lower is not enough: the
   same OCR on the same font repeats its own confusions, `l` for `1`); two that differ keep the
   surer one, marked, with the other offered as a one-tap alternative. When most names differ,
   the page asks whether the screenshots show the same team. Anything a member typed, chose or
   confirmed is never overwritten by a screenshot; a row a member edited stays as edited.

Nothing is invented: a field that cannot be read stays empty and marked, and no Riot ID or tag
is ever made from a name.

## Checking and correcting (`scout-card.tsx`, `edit.ts`)

There is no detail window: everything is in the card, which keeps the same size and alignment as
the other four (no pop-out, no hover enlargement).

- **Where the name came from**: **From the screenshot**, **Check the name** (read with low
  confidence, or the screenshots disagree: the name as it appears in the screenshot is shown, with
  **Looks right** and the other reading as **Or "…"**), **Corrected** (with what was read),
  **Confirmed**, **Entered** (typed with nothing read). A verified player shows the Riot ID Riot
  confirmed instead.
- **The pencil** (top right of the card) opens its editor in place: the name (Enter keeps it,
  Escape cancels; any script), the rank (tier, division, LP), every figure of every row, rows
  added or removed. The pencil again closes it. A copy button copies the name or Riot ID.
- **Champions**: a portrait marked "?" is a suggestion or unknown. Tapping any portrait opens the
  champion list, searchable, with portraits: "Is it Akali?" offers the suggestion first; "Which
  champion is it?" for an unknown one.
- A rank read with low confidence and a row not read surely carry a small dot; the card's foot
  counts what is left to check ("1 row · 1 champion to check").
- A corrected name, rank, row or chosen champion is the member's and stays through any later
  screenshot.

### How well it works (measured, not assumed)

The fixtures are the two League client screenshots a member pasted
(`tests/fixtures/clash/client-{ranked,mastery}-1080.png`: the opponents as the client shows them,
the member's friends list and own name replaced by invented ones) and synthetic screens with names
in five scripts (`scripts/clash-scout-fixtures.mjs`).

- `tests/clash/recognition.test.ts` (local, about a minute: `pnpm vitest run tests/clash`) runs
  the real pipeline with the same Tesseract models on the client screenshots as captured
  (1920×1080) and as other captures give them: 1280×720, 2560×1440, saved as JPEG (quality 50),
  cropped to the scouting panel, and the client in a 1600×900 window on a 2560×1440 desktop. In
  every one of them all five names (Jettos, Kye, Hai, Green, Oliver, in order), the team's name,
  the ranks (and Green's absent one), the totals and every ranked and mastery figure come out
  exactly, about 3 s per screenshot. During development the client's smallest size (1024×576)
  also read every field.
- On the synthetic screens, names in Cyrillic, Hangul, Japanese and Chinese come out exactly, and
  champions are recognised except where two synthetic portraits are near twins (then left
  unknown). A Latin name with `1`/`l` and `x`/`X` lookalikes ("xX_Sn1per_Xx") can be read as its
  lookalike: it is then marked for checking, never trusted. At 1280 px a synthetic `%` can be
  misread; that win rate is then left empty and its row marked.
- `src/domain/clash-scout/layout.test.ts` (CI) checks the layout on the client screenshots from
  their real pixels and the words Tesseract read in them (recorded once): the columns, the names'
  row, that no friend, timer or label becomes a player, and that every figure stays with its
  player.
- In a real browser (headless Chromium; Tesseract in its Web Worker, its files served locally in
  place of jsDelivr), pasting both client screenshots filled all five cards completely: 4.8 s for
  the first (including starting Tesseract and loading the English model) and 3.5 s for the second.
- **Champions on the client screenshots** (`src/domain/clash-scout/portraits.test.ts`, CI): the
  screenshots' real pixels against prints of all 173 champions made from Data Dragon 16.18.1's
  squares (`tests/fixtures/clash/prints-16.18.1.json`; Data Dragon itself is not reachable from
  the development environment, so the squares came from a public GitHub mirror of it). At
  1920×1080, 1280×720, 2560×1440 and as a quality-50 JPEG: all 46 champions shown are recognised,
  none wrongly, and the 4 portraits that are not a champion's stay unknown. The measured geometry
  stays within 0.04 of the box's side of the one measured by hand. The full OCR test reads them
  the same way (`tests/clash/recognition.test.ts`).
- Not measured here: other client languages, non-Latin names in the client's own fonts, and
  production's own prints (built from the live Data Dragon at the current patch, 16.21.1 at the
  time of writing).

## Finding the account (`identity.ts`, `server/clash/candidates.ts`, `links.ts`, `open-profiles.tsx`)

Clash's scouting screens show names, not tags. A name alone can belong to several accounts, so
**no profile is linked from a name and no tag is ever guessed.** Each player is in one of three
states, shown in their card:

- **Verified**: Riot confirmed the exact Riot ID. A member types it (`Name#TAG`, e.g. from OP.GG or
  the client), or confirms a possible match with **It's them**, and **Check** asks Riot's ACCOUNT-V1
  API whether that exact account exists (`accountByRiotId`, the app's server key, at most one
  check every 2 s and 40 an hour per member). Only then is the player verified: the name becomes
  Riot's spelling and links to the player's OP.GG profile in a new tab (the shared OP.GG builder,
  `op.gg/lol/summoners/<region>/<name>-<tag>`, on the scout's server). The server signs each
  verification (HMAC over team, server, Riot ID and PUUID); saving keeps "verified" only with a
  valid signature or when it was already verified in the stored scout, so a browser cannot save an
  invented verification. Changing the name or the opponents' server, or **Not this account** in
  the card's editor, makes the player unverified again. Saved scouts keep the verified PUUIDs, so
  the account is recognised in later scouts (**Seen before**).
- **Possible match**: an account UNIIVERSE already knows has exactly this name on this server
  (case and spaces aside), from what the team holds lawfully and nothing else:
  1. an account a member verified in one of the team's earlier scouts;
  2. a player of the team members' own recorded games (the team's own accounts left out).

  Each is shown under the Riot ID Riot gives for it **now** (ACCOUNT-V1 by PUUID, kept ten
  minutes), and only when that still has exactly this name: a renamed or deleted account is not
  offered, and no older Riot ID is ever shown. PUUIDs never reach the browser. What the screenshots
  show is compared with what UNIIVERSE knows of each, and the card lists the facts and a strength:
  - **Strong match**: mastery champions as in the earlier scout, with points that only grew, and
    as fast as they can (a mastery point total never goes down), a total that agrees, a close rank;
  - **Some match**: weaker agreement, such as champions it played with or against the team;
  - **Name only**: nothing else agrees, or something contradicts it ("Some mastery points are
    lower than before: probably another account").

  Similarity is never proof: the card says so, nothing is linked until a member chooses **It's
  them** and Riot confirms the exact Riot ID, and several accounts of the same name are listed best
  first without choosing one. **Not them** hides a candidate for this scout. Only recognised or
  member-chosen champions count as evidence; a suggested one does not. Bounded: five names, three
  candidates a name, one Riot request each; the lookup runs (debounced) after the names are read,
  for team members only, at most once every 2 s and 60 times an hour per member.
- **Not identified**: nothing known has this name. **Enter the Riot ID** opens the field with the
  name and "#" already typed; the tag is the member's to add.

**Open all 5 profiles** (above the cards; nothing opens by itself, only this button opens tabs):
- Before the click it says how many are identified and names those who are not ("3 of 5
  identified · not identified: Kye, Hai").
- It opens each verified player's own profile in a tab of its own, through the shared OP.GG link
  builder, on the scout's server (an OCE team's scouts default to OCE). It never opens a
  multi-search page and never makes a link from an unconfirmed Riot ID.
- Browsers often allow one new tab per click unless pop-ups are allowed for the site: the profiles
  the browser kept from opening are then listed in place as plain links, one tap each.
- The players not identified are listed with **Search on OP.GG** (copies the name and opens OP.GG,
  where it is pasted into OP.GG's own search: OP.GG publishes no link that searches by name) and
  **Enter Riot ID** (scrolls to the card and opens its field).
- Tabs are opened with `noopener`; the fallback links are `target="_blank" rel="noopener
  noreferrer"`.
- **Seen before**: an account the team saved in an earlier scout is recognised by Riot's account
  id (PUUID) only, never by a similar name, and links to those scouts.
- **Games against these accounts** (saved scouts): the team's own stored games from a day before
  the scout to a week after in which at least two of the scout's verified accounts played on the
  other side. No match is registered by hand and nothing is assumed from the scout alone.

### Riot policy notes

- Riot's developer policy says products may not de-anonymize players who cannot reasonably be
  identified from visible information, nor expose a player's historic Riot IDs. Clash Scout uses
  what the screenshots show, a Riot ID a member supplies, and accounts the team already holds
  (earlier verified scouts, the members' own recorded games). It never searches Riot or any other
  site for accounts behind a name, never generates or tries taglines, and never shows an older
  Riot ID: a candidate is shown under the Riot ID Riot gives for its PUUID now, and "Seen before"
  shows the earlier scout (opponent and date).
- Riot's Clash API (CLASH-V1, which can list a Clash team's players) is not used: it needs Riot's
  approval for the product, which this registration does not have. Nothing here works around that:
  the Clash screen's names stay names until a member supplies or confirms the exact Riot ID.
- Verification and the candidates' current Riot IDs use the existing server key and ACCOUNT-V1
  (`by-riot-id` and `by-puuid`), only when a member scouts (never in the background), within the
  limits above.

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
> or confirms that player's full Riot ID (Name#TAG, for example from the opponent's public OP.GG
> page) and the app confirms with ACCOUNT-V1 that this exact account exists. To help, the page may
> list accounts the team already holds with exactly that name (accounts verified in the team's
> earlier scouts, and players of the members' own recorded games), each under its current Riot ID
> from ACCOUNT-V1 by PUUID; nothing is linked until a member confirms one. No tag is guessed, no
> account is searched for behind a name, and no older Riot ID is shown. Saved scouts are visible
> to the team only and can be deleted by the team owner.

**APIs used:**
- ACCOUNT-V1 (`/riot/account/v1/accounts/by-riot-id`): resolve a Riot ID a member typed (their
  own accounts at linking; an opponent's for Clash Scout verification, at most one check every
  2 seconds and 40 an hour per member, never in the background).
- ACCOUNT-V1 (`/riot/account/v1/accounts/by-puuid`): the current Riot ID of an account the team
  already holds (an earlier scout's verified account, or a player of the members' recorded games)
  whose name matches a scouted name, so it is shown under its current Riot ID or not at all (at
  most three accounts a name, five names a scout, each kept ten minutes; never in the background).
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
  supplies (or confirms from accounts it already holds) and Riot confirms. No tagline is generated
  and no account identifier is tried.
- CLASH-V1 is not used (it needs Riot's approval).
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

Administrators (accounts given administrator access) have the Team Lineup Manager column here;
permanent deletion stays with the Owner account. Personal-use accounts (not team members) have
none of these. Concurrent edits are guarded by the
scout's `updated_at` (a stale save is refused with "Someone else changed this scout meanwhile").

## Cost and performance

- No paid service. Tesseract and its models are open source and served by jsDelivr's free CDN.
- Database: one insert (or update) per save, plus up to five rows of verified accounts; the history
  list reads summary columns only (no snapshot), searched with `strpos` on a lower-cased column.
  The games-against query sends only matches that contain a scouted account.
- Server: the champion prints are built once per patch per server instance (about 170 small
  Data Dragon downloads, kept in memory for a day), and the browser keeps them for a year.
- Possible matches: one lookup per change of the five names or their evidence (debounced, members
  only, throttled): two bounded queries (earlier scouts' verified accounts, at most 60 rows; the
  members' games' players with those names, at most 400 rows) and at most three Riot requests a
  name, each answer kept ten minutes. Nothing is stored.

## Out of scope (by design)

No draft simulation, pick/ban recommendations, ban rankings, threat scores or dashboards.

## Browser tests

`e2e/clash-scout.spec.ts` uses a stand-in recogniser (`UNIIVERSE_FAKE_SCOUT_OCR=1`, in-memory demo
only, set in `playwright.config.ts`) so CI does not download Tesseract; it tests the workspace:
pasting with Ctrl+V (and a paste meant for a text field left alone), dropping, choosing,
sequential screenshots, the same screenshot twice, reading as the other screen, trying again
after a failure, the draft surviving a reload without being saved, replacing and removing a
screenshot, correcting a name in its card and keeping the correction through a new screenshot,
names the two screenshots read differently, players nothing could be read for (cards stay
aligned), identifying a player in their card (the in-memory demo's stand-in Riot client), the name
linking to OP.GG in a new tab only once verified, **Open all 5 profiles** (one tab per verified
player through a stubbed `window.open`; when the browser blocks some, the fallback links; the
players not identified and their **Enter Riot ID**), the next scout offering the verified account
as a strong possible match and confirming it, champions (a recognised portrait, a suggestion
confirmed from the list, an unknown one found by searching, kept through a new screenshot),
figures corrected in the card's editor, saving, the history and its search, permissions, and
phone and desktop layouts. The browser tests run offline, so portraits are lettered tiles there;
real portraits and recognition are covered by the unit tests above.
