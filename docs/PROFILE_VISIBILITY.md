# Who sees a player's profile, rank and games

Two owner decisions (4 November 2026) and where the code applies them. Every rule is enforced on
the server; hidden buttons are never the security. Tests: `tests/db/profile-visibility.test.ts`
(real pages, components, actions and routes with a real session cookie) and
`src/server/auth/permissions.test.ts`.

This note is the reference until the mobile redesign (PR #203) is merged; then
`docs/UNIIVERSE_TECHNICAL_HANDOVER.md` §G1 (Visibility) and `docs/ARCHITECTURE.md` (Players,
Personal-use accounts) get a short pointer to it. Those two files are left alone until then
because PR #203 changes them.

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
- **Follow-up, not done yet:** the Players directory (`src/app/(app)/players/page.tsx` →
  `players-directory.tsx`) still shows every member's rank to anyone with `view-players`. It is
  left until PR #203, which rewrites the directory, is merged. Then its `rankOf` returns null for
  a teammate unless `canViewPlayerStats`, and the card leaves the rank out
  (`CardIdentity showRank={false}`), as on Team Overview.

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
  - `/api/freshness?scope=player:<id>` answers 403 "Not allowed", as for any refusal.
  - `/api/card-banners/<playerId>` answers 404.
  - `/api/avatars/<userId>` answers 404 for the picture of a personal-use player's account. A
    user always gets their own picture.
- **In a team member's games:** the personal-use player is any other player of the game. They are
  not named or linked to a profile. Nothing comes from their linked account: their rank is what
  the checks of a game's players found (`last_known_ranks`), as for anyone, and their OP.GG link
  uses the Riot ID the stored games recorded, not their account's current one. Archived profiles
  are read the same way. The readers take the accounts they may use:
  - `storedRankReadings(…, { linked })` and `recordedRanksBefore` in
    `src/server/players/participant-ranks.ts`;
  - `knownRiotIds(…, { linked })` in `src/server/players/riot-names.ts`. Without `linked`, as on
    Team → Matches, it uses only current team members' accounts.
- **In their own games:** nobody on the team is named, the team's players are read as any other
  players, and Refine offers no team member (`getMatchHistory`'s `memberOptions`). Their own rank
  and Riot ID come from their own accounts, as always.
- **The privacy notice** already promises that a personal-use account is seen only by its own
  player and administrators, so its text (and `PRIVACY_UPDATED`) is unchanged.
