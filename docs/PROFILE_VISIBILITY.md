# Who sees a player's profile, rank and games

Two owner decisions (4 November 2026) and where the code applies them. Every rule is enforced on
the server; hidden buttons are never the security. Tests: `tests/db/profile-visibility.test.ts`
(real pages, components, actions and routes with a real session cookie) and
`src/server/auth/permissions.test.ts`.

This note is the reference. `docs/UNIIVERSE_TECHNICAL_HANDOVER.md` §G1 (Visibility) and
`docs/ARCHITECTURE.md` (Players, Personal-use accounts) point to it.

## 1. A teammate's rank is a statistic

- **The rule:** `canViewPlayerStats` (`src/server/auth/permissions.ts`). Your own statistics
  always; anyone else's only with "view teammates' statistics" (`view-teammate-stats`). The rank
  is one of them: tier, division, LP, queue and the ranked wins and losses. The capability's
  description in Admin → Users & Permissions says so.
- **A hidden rank is left out, never shown as "Unranked".** "Unranked" means a check found no
  ranked entry; "—" means nothing was read; a hidden rank shows nothing at all.
- **Where it applies:**
  - **Team Overview** (`getTeamRosterForViewer`, `src/server/team/roster.ts`): without the right,
    a teammate's card carries name, roles, lineup place and pool champions only.
  - **A teammate's profile** (`/players/[id]` and every tab): the header's identity
    (`headerIdentity`, `src/components/players/profile-sections.tsx`) carries `showRank: false`
    and no rank. The Riot Accounts tab sends the accounts without their rank fields
    (`withoutRank`, `src/server/accounts/repository.ts`), and so does the answer of linking an
    account (`addPlayerAccountAction`). The header and the Card Studio preview leave the rank out.
  - **The cards and the match window of one's own games** (`src/server/players/game-audience.ts`):
    a current team member in the game is still named and linked to their profile, but without the
    right their rank is left out of the scoreboard (`getMatchDetail`: `rank: null`), of the rank
    check (`getMatchRanks`: no slot for them, and they are never checked with Riot) and of the
    game's card (`getMatchHistory`: the composition's place has no `rank`). Their linked account's
    rank history is not read for that viewer.
  - Teammates' match histories need the right anyway (the Match History tab and the match actions
    refuse without it), so in practice this matters for a viewer's own games.
- **The Players directory** (`src/app/(app)/players/page.tsx` → `players-directory.tsx`): each
  entry carries `showRank = canViewPlayerStats(viewer, player)`, and a hidden rank is not sent at
  all. The desktop card (`PlayerSummaryCard` → `CardIdentity showRank`) and the phone row (#203's
  `PlayerRow`) both leave the rank out, with its separator, as on Team Overview.

## 2. A personal-use profile is its player's and the administrators' only

A personal-use profile has `players.team_member` false. It opens only for its own player and for
administrators: the Owner, and accounts with `users.is_admin`. The rule is `canOpenProfile`, read
from the stored membership by `mayOpenProfile` in `src/server/auth/profile-access.ts`. Anyone
else is answered as for a profile that does not exist, whatever their capabilities, a Player
Manager and a Team Lineup Manager included.

- **Pages:** the `/players/[id]` layout and every tab page load the profile through
  `viewableProfileHeader` and answer "not found". `src/app/page-guards.test.ts` pins that every
  profile page uses the rule.
- **Actions:**
  - The profile and Riot account actions refuse it: `requirePlayerEditor` and
    `requireRiotAccountEditor` (`requireOpenableProfile`). So do `archivePlayerAction`,
    `cardPreviewFiguresAction` and the match-history actions (detail, timeline, groups, meetings,
    ranks, Refresh, catch-up).
  - The lineup refuses it with "That player is not on the team, so they cannot join the lineup."
    (`assertLineupEligible`, `src/server/repositories/team.ts`). That is the same answer as for a
    player who no longer exists, and it comes before anything that would name them, a bench swap
    included.
- **Routes:**
  - `/api/freshness?scope=player:<id>` answers 403 "Not allowed", as for any refusal. The team's
    version (`scope=team`, `teamFreshness` in `src/server/ops/freshness.ts`) is built from current
    team members only, so a personal-use player's syncs, games, card and pools do not move it.
  - `/api/card-banners/<playerId>` answers 404.
  - `/api/avatars/<userId>` answers 404 for the picture of a personal-use player's account. A
    user always gets their own picture.
- **In a team member's games:** the personal-use player is not named or linked to a profile, and
  nothing comes from their linked account (its rank, rank history or current Riot ID). Archived
  profiles are read the same way. They also get less than a stranger in the same game:
  - **Rank:** only what a check of the game's players found (`last_known_ranks`). The checks after
    collection (`checkRecentGameRanks` in `src/server/players/participant-ranks.ts`, the
    `rank-checks` job) skip every linked account, whoever's it is, so they show no rank on the
    Match History cards until a game they are in is opened. The match window's check
    (`getMatchRanks`) then asks Riot for it, within the same limits as for anyone, and the cards
    show that reading from then on.
  - **OP.GG link:** the Riot ID that game recorded. A stranger is linked by the newest Riot ID of
    a later stored game; they are not, because their later games are stored only because their own
    account syncs.
  - **Encounters and possible groups:** they do not appear. Both leave out every player with a
    linked account (`src/server/players/encounters.ts`, `src/server/matches/possible-groups.ts`).
  - The readers take the accounts they may use: `storedRankReadings(…, { linked })` and
    `recordedRanksBefore` in `src/server/players/participant-ranks.ts`, and
    `knownRiotIds(…, { linked })` in `src/server/players/riot-names.ts` (which also leaves a
    linked account outside `linked` out of the newer games' Riot IDs). Without `linked`, as on
    Team → Matches, `knownRiotIds` uses only current team members' accounts.
- **In their own games:** nobody on the team is named and Refine offers no team member
  (`getMatchHistory`'s `memberOptions`). The team's players are read as the personal-use player is
  in a team member's game, above: nothing from their linked accounts, no rank on the cards until a
  game they are in is opened, the Riot ID that game recorded, and not in Encounters or possible
  groups. Their own rank and Riot ID come from their own accounts, as always.
- **An administrator** opening a personal-use player's games (who may open the profile) still
  sees the team members in them named and linked, with their ranks, and offered in Refine, as in
  a team member's games (`gameAudience`'s `admin`, from `isAdmin`).
- **The privacy notice** already promises that a personal-use account is seen only by its own
  player and administrators, so its text (and `PRIVACY_UPDATED`) is unchanged.
