"use client";

import { standoutText } from "@/lib/tip-words";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { MULTIKILL_NAMES } from "@/domain/multikills";
import { QUEUE_GROUP_WORDS, figureText, queueGroup, type FigureKey } from "@/domain/match-analysis";
import { narrowsGames, refineParams, type SessionSummary } from "@/domain/history-refine";
import type { MatchHistoryPage, MatchRow } from "@/server/players/match-history";
import type { Composition } from "@/server/matches/compositions";
import type { ParticipantRank } from "@/domain/known-rank";
import type { PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { timeAgo, formatCount, formatDayMonth, formatNumber, formatTimeOfDay } from "@/lib/format";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { MatchDetailModal } from "./match-detail";
import { MatchDetailCacheContext, createMatchDetailCache, type MatchDetailCache } from "./match-detail-cache";
import { EncounterLinkContext, type EncounterLink } from "./post-game";
import { GameSteps, MatchExpansion, bringBack, holdInPlace, revealOpened, type GameNav } from "./inline-match";
import { HistorySummaryStrip } from "./history-summary";
import { ItemRow } from "./icon-img";
import { MultikillTag } from "./multikill-tag";
import { ScoreMark, ScoreMarkEmpty, scoreWords } from "./score-mark";
import { ChampionLoadout, LpChange, lpSpoken, MatchRail, MatchResult, matchCardClass, matchTone } from "./match-card";
import { TeamComposition } from "./team-composition";
import { ModeElsewhere, OverviewFilters } from "@/components/players/overview-filters";
import { HistoryRefineFields, historyRefinements } from "./history-refine-fields";
import { EncounterGamesPanel, type EncounterGamesFocus } from "./encounter-games";
import { MatchHistoryHeader, scopeText } from "./match-history-header";
import { encounterFocusParams, encounterListParams } from "@/domain/encounters";
import { statsQuery } from "@/domain/season-stats";
import type { DataStatus } from "@/domain/data-status";
import { DataStatusNote, RefreshButton, type DataRefreshTarget } from "@/components/ui/data-status";
import { useNow } from "@/components/ui/relative-time";
import { fmtDuration, fmtInt, fmtNum } from "./match-format";
import { WINDOW_POSTURE_QUERY, keepsEscape, modalOpen, prefersWindow } from "@/components/ui/posture";
import { pagerFold, pagerItems } from "./pager";
import { screenHeight, scrollToStart } from "@/lib/screen";

/**
 * The gap between cards in rem, and ROW_REM, a wide card's height plus that gap (6.375rem: the
 * teams' five lines, the card's padding and border); pixels follow the root size. Both serve only
 * to count how many whole cards a very tall window has room for below the list's top (the page
 * size below), which measures the first card as drawn and falls back to ROW_REM on a page with no
 * card.
 */
const GAP_REM = 0.375;
const ROW_REM = 6.375 + GAP_REM;
const PHONE_PER = 10;

/*
  A card's grid, by the list's own width (@container/mh; see MatchCard):
    under 36rem  three columns (portrait, champion, K/D/A) and rows placed by the PHONE_* classes:
                 1 the result line across the card; 2–3 the portrait and the K/D/A beside the
                 champion and role (row 2) over the build (row 3); 4 the figures. Under 21.375rem
                 the build cannot sit beside the K/D/A: kill participation takes its place under
                 the champion (row 3), so CS and damage keep one line (4), and the build closes the
                 card (5). The rows are 4px apart; the result line and the figures add 2px of their
                 own, so they stand 6px off the rest.
    36–50rem     five columns in one row (portrait, result line over the champion, K/D/A, figures,
                 build), placed in order, and the teams across the next row.
    from 50rem   one row (since #271): the performance score has a column of its own right after
                 the K/D/A (25 Nov 2026), and the teams join from 65rem.
  Every phone placement is written for the narrowest card and changed from 16rem, 21.375rem and
  36rem (min-width queries only, so the wider one always wins). Under 16rem (a phone at a large
  text size: 150% on most, 125% on a 320px one) the portrait, the champion and the widest K/D/A no
  longer fit side by side: two columns, the K/D/A and its ratio on a line under the champion (3),
  then the figures (4) and the build in two rows (5); nothing is cut or wider than the card.
*/
const CARD_GRID = [
  "relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-3 py-2.5 @max-[16rem]/mh:grid-cols-[auto_minmax(0,1fr)]",
  "@min-[36rem]/mh:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] @min-[36rem]/mh:gap-x-3 @min-[36rem]/mh:gap-y-2",
  "@min-[50rem]/mh:grid-cols-[6.75rem_auto_minmax(6rem,0.7fr)_minmax(auto,0.5fr)_2.5rem_minmax(auto,0.6fr)_minmax(auto,2fr)_auto] @min-[50rem]/mh:gap-x-2.5 @min-[50rem]/mh:py-2",
  "@min-[54rem]/mh:grid-cols-[6.75rem_auto_minmax(6.25rem,0.7fr)_minmax(auto,0.5fr)_2.5rem_minmax(auto,0.6fr)_minmax(auto,2fr)_auto]",
  "@min-[65rem]/mh:grid-cols-[6.75rem_auto_minmax(6.25rem,0.7fr)_minmax(auto,0.5fr)_2.5rem_minmax(auto,0.6fr)_auto_minmax(13rem,2fr)] @min-[74rem]/mh:grid-cols-[6.75rem_auto_minmax(6.25rem,0.7fr)_minmax(auto,0.5fr)_2.5rem_minmax(auto,0.6fr)_auto_minmax(13rem,2fr)_auto] @min-[74rem]/mh:gap-x-4 @min-[76rem]/mh:gap-x-5",
].join(" ");
/** The portrait: row 2 (rows 2–3 from 16rem); placed in order from 36rem. */
const PHONE_PORTRAIT = "col-[1] row-[2] @min-[16rem]/mh:row-[2/span_2] @min-[36rem]/mh:col-auto @min-[36rem]/mh:row-auto";
/** The K/D/A at the card's end, beside the champion (and the build under it), capped at the widest K/D/A on a phone. */
const PHONE_KDA = "col-[3] row-[2] max-w-[5.75rem] @max-[16rem]/mh:col-[1/-1] @max-[16rem]/mh:row-[3] @max-[16rem]/mh:flex @max-[16rem]/mh:max-w-none @max-[16rem]/mh:flex-wrap @max-[16rem]/mh:items-baseline @max-[16rem]/mh:gap-x-2 @max-[16rem]/mh:text-left @min-[16rem]/mh:row-[2/span_2] @min-[36rem]/mh:col-auto @min-[36rem]/mh:row-auto @min-[36rem]/mh:max-w-none";
/**
 * The figures: a line across the card under the champion (4), a column of their own from 36rem. From
 * 16 to 21.375rem the line steps aside (display: contents): kill participation goes under the
 * champion (PHONE_KP), and CS and damage keep the line (PHONE_FIGURES_REST).
 */
const PHONE_FIGURES = "col-[1/-1] row-[4] mt-0.5 @min-[16rem]/mh:contents @min-[21.375rem]/mh:flex @min-[36rem]/mh:col-auto @min-[36rem]/mh:row-auto @min-[36rem]/mh:mt-0";
const PHONE_KP = "@min-[16rem]/mh:col-[2] @min-[16rem]/mh:row-[3]";
const PHONE_FIGURES_REST = "contents @min-[16rem]/mh:col-[1/-1] @min-[16rem]/mh:row-[4] @min-[16rem]/mh:mt-0.5 @min-[16rem]/mh:flex @min-[16rem]/mh:flex-wrap @min-[16rem]/mh:gap-x-3 @min-[16rem]/mh:gap-y-0.5 @min-[21.375rem]/mh:contents";
/**
 * The build: the card's last line under 21.375rem, then a column of its own from 36rem (PHONE_BUILD).
 * From 21.375 to 36rem it is drawn under the champion's name beside the K/D/A (its items 20px), above
 * the figures: there a copy placed after the K/D/A is shown instead (PHONE_BUILD_BESIDE), so the
 * card is read in the order it is drawn. Only one of the two is ever displayed.
 */
const PHONE_BUILD = "col-[1/-1] row-[5] [--icon-size:1.25rem] @min-[21.375rem]/mh:hidden @min-[36rem]/mh:col-auto @min-[36rem]/mh:row-auto @min-[36rem]/mh:flex @min-[36rem]/mh:[--icon-size:initial]";
const PHONE_BUILD_BESIDE = "col-[2] row-[3] hidden items-center overflow-hidden [--icon-size:1.25rem] @min-[21.375rem]/mh:flex @min-[36rem]/mh:hidden";

export { fmtDuration, fmtNum, fmtInt } from "./match-format";
export { pageList } from "./pager";

/** Ranks the match window checked (by place in the stored record) over the opponents' stored ones. */
function withChecked(teams: Composition, checked: ReadonlyMap<number, ParticipantRank>): Composition {
  const side = (slots: Composition["blue"]) => slots.map((s) => (s.rank && checked.has(s.slot) ? { ...s, rank: checked.get(s.slot)! } : s));
  return { ...teams, blue: side(teams.blue), red: side(teams.red) };
}

/** A figure's short name on a card's "best" chip. */
const STANDOUT_SHORT: Record<FigureKey, string> = { kda: "KDA", csPerMin: "CS/min", damagePerMin: "damage/min", visionPerMin: "vision/min", killParticipation: "KP", goldPerMin: "gold/min", damageShare: "damage share" };

/** The team members in the game, beside the player and against them (by PUUID: domain/compositions, never guessed). */
function membersIn(teams: Composition | null) {
  if (!teams?.side) return { with: [], against: [] };
  const other = teams.side === "blue" ? "red" : "blue";
  return { with: teams[teams.side].filter((s) => s.member && !s.you).map((s) => s.member!), against: teams[other].filter((s) => s.member).map((s) => s.member!) };
}

/**
 * Memoised: opening a match re-renders only the cards it opens and closes, not the whole page. The
 * breakdown opens under its card (MatchBreakdown), one game at a time.
 */
const MatchCard = React.memo(function MatchCard({ row, playerId, champion, champ, onToggle, onPrefetch, nav, expanded, fit = true, checked }: { row: MatchRow; playerId: string; champion: PortraitChampion; champ: (id: string | null) => PortraitChampion; onToggle: (matchId: string) => void; onPrefetch: (matchId: string) => void; /** The open game's way to the previous and next games on the page (null at that end). */ nav: GameNav | null; expanded: boolean; /** Bring the game into view once drawn (an open, not a step from another game). */ fit?: boolean; /** Ranks its breakdown checked with Riot, shown without reloading the page. */ checked?: ReadonlyMap<number, ParticipantRank> }) {
  const kp = row.killParticipation === null ? "—" : `${Math.round(row.killParticipation * 100)}%`;
  const tone = matchTone(row.win);
  const account = row.riotId ? row.riotId.split("#")[0] : null;
  const when = timeAgo(new Date(row.playedAt), useNow());
  const kda = row.kills === null ? "—" : `${row.kills} / ${row.deaths} / ${row.assists}`;
  const ratio = row.kda === null ? "details not collected" : row.perfect ? "Perfect KDA" : `${row.kda.toFixed(2)} KDA`;
  const multikill = row.multikill ? MULTIKILL_NAMES[row.multikill] : null;
  // The game's performance score: the opened game's own (docs/PERFORMANCE_SCORE.md); pending while a
  // Summoner's Rift game's timeline is not stored, which draws nothing (the label says why).
  const scored = row.performance.state === "ok" ? row.performance : null;
  const scoreSpoken = scored ? `, ${scoreWords(scored).replace(/^P/, "p")}` : row.performance.state === "pending" ? ", performance score once the game's timeline is stored" : "";
  // A stored record without items: no build to draw (see the build's place below).
  const unrecorded = row.record === "stored" && !row.items;
  // One line of seven on a phone's card (the trinket last), two rows of three and four from 36rem
  // (and under 16rem, at a large text size, where seven do not fit across). The line beside the
  // K/D/A sizes its tracks by their items (seven 20px items, the gaps and the trinket's margin: the
  // 154px a 21.375rem list leaves beside the widest K/D/A), so nothing is squeezed or clipped.
  const itemRow = (className: string, trinketClassName: string) => (row.record === "stored" ? <ItemRow items={row.items} size={22} stacked className={className} trinketClassName={trinketClassName} /> : <span className="text-xs text-fg-subtle">{row.record === "missing" ? "Items being collected" : "Items not provided by Riot"}</span>);
  const build = itemRow("grid-cols-7 @max-[16rem]/mh:grid-cols-4 @min-[36rem]/mh:grid-cols-4", "order-last ml-0.5 @max-[16rem]/mh:order-none @max-[16rem]/mh:ml-0 @min-[36rem]/mh:order-none @min-[36rem]/mh:ml-0");
  const teamsId = `teams-${row.matchId}`;
  const regionId = `match-${row.matchId}-details`;
  const teams = React.useMemo(() => (row.teams && checked ? withChecked(row.teams, checked) : row.teams), [row.teams, checked]);
  const members = membersIn(row.teams);
  const roleName = row.role ? ROLE_LABELS[row.role as Role] : null;
  const standout = row.standout;
  const standoutTitle = standout ? standoutText({ label: standout.label, games: standout.games, queue: QUEUE_GROUP_WORDS[queueGroup(row.queueId)], role: roleName, value: figureText(standout.key, standout.value), top: figureText(standout.key, standout.top) }) : undefined;
  /** "Best vision/min in 22": one chip, with the figures on every card (under them on wide cards, in their row on narrow ones); under 16rem (a large text size) it wraps between its words rather than be cut. */
  const standoutChip = (className: string) =>
    standout ? (
      // Its sentence one hover or tap away, as the LP's is (no tab stop: the card is the one stop, and the chip reads it out).
      <InfoTip text={standoutTitle} testId="match-standout-tip" tabIndex={-1} className={cn("relative z-[2]", className)}>
        <span className="whitespace-nowrap rounded border border-accent/40 px-1 text-2xs font-semibold leading-4 text-accent @max-[16rem]/mh:whitespace-normal" data-testid="match-standout" data-key={standout.key}>
          Best {STANDOUT_SHORT[standout.key]} in {standout.games}
        </span>
      </InfoTip>
    ) : null;
  /*
    The result line: Victory or Defeat, the queue, when, and a ranked game's LP. Never cut: where the
    line is too narrow (a 320px phone at a large text size), it wraps between its parts ("Defeat ·
    Solo/Duo" / "· 43h ago"), so the time stays whole. A ranked game's LP ends it: at the card's end
    on a phone, after when from 36rem. Two copies, each where its card is read in the order it is
    drawn: a phone's first line, before the portrait; a two-row card's, over the champion. Only one
    is ever displayed (a wide card has its result column instead).
  */
  const metaLine = (className: string) => (
    <span className={cn("min-w-0 flex-wrap items-center gap-x-1 text-xs font-bold", tone.text, className)} data-testid="match-card-meta">
      <span>{tone.word}</span>
      {/* The line names the queue without "Ranked" (a wide card's result column has the full
          name), so it stays one line with the LP on a phone and on a two-row card. */}
      <span className="whitespace-nowrap font-medium text-fg-subtle">· {row.queue.replace(/^Ranked /, "")}</span>
      {/* "3h ago" is measured on the server first, then by the browser's own clock (useNow):
          the server's words stand while the page hydrates, which React allows only for an
          element's own text, so the span that holds it carries the permission. */}
      <span className="whitespace-nowrap font-medium text-fg-subtle" suppressHydrationWarning>
        · {when}
      </span>
      {row.lp ? (
        // A dash's trigger reaches 6px past it each side (its target size): the padding keeps
        // that inside the line where the dash ends it.
        <span className={cn("ml-auto inline-flex items-center whitespace-nowrap font-medium text-fg-subtle @min-[36rem]/mh:ml-0", row.lp.kind === "none" && "pr-1.5")}>
          <span className="mr-1 hidden @min-[36rem]/mh:inline" aria-hidden>
            ·
          </span>
          <LpChange lp={row.lp} dense />
        </span>
      ) : null}
    </span>
  );
  /*
    The performance score and place (score-mark.tsx): one mark at every width, in one place on every
    card of a list, the box kept with a quiet dash where the game has no score yet, so nothing moves
    with the champion, the items, the result or the score. A wide card gives it a column of its own
    right after the K/D/A, the score over its place; a phone's and a two-row card a line of its own
    directly under the K/D/A and its ratio, the score beside its place. Only one of the two is ever
    displayed.
  */
  const scoreMark = (layout: "stack" | "inline") => (scored ? <ScoreMark score={scored} layout={layout} testId="match-score" badgeTestId="match-placement" /> : <ScoreMarkEmpty layout={layout} testId="match-score-empty" />);
  const open = React.useRef<HTMLButtonElement>(null);
  return (
    <li
      id={`match-${row.matchId}`}
      className="scroll-mt-0 lg:scroll-mt-3"
      data-testid="match-item"
      data-expanded={expanded || undefined}
      // Escape, with the focus anywhere in the open game, closes it.
      onKeyDown={
        expanded
          ? (e) => {
              if (e.key !== "Escape" || e.defaultPrevented || modalOpen() || keepsEscape(e.target)) return;
              e.preventDefault();
              onToggle(row.matchId);
            }
          : undefined
      }
    >
      {/* One game per card, read the way a player scans a match list: the result (Victory /
          Defeat, the queue, when, a ranked game's LP), the champion (its level, spells and runes),
          the KDA with the game's largest multikill, the performance score with its place (MVP,
          ACE or "3rd": the owner's requirements of 25 Nov 2026), the figures (kill participation,
          CS and damage, each with its total or share, and, rarely, a figure the player never beat
          in their recent comparable games), the build and both teams (who played what, the player
          in bold, team members in the accent colour, everyone's stored rank). The layout follows the list's own
          width (a container query), not the window's, in three tiers (CARD_GRID and the PHONE_*
          placements below; owner decision D8 of 8 Nov 2026 for the first two):
            under 36rem  the phone's card, about 118px: the result line across the card with the
                         LP at its end; the portrait, the champion and role with the build under
                         them (from 21.375rem, where the widest K/D/A still fits beside a line of
                         seven 20px items; narrower, the build closes the card) and the K/D/A; then
                         the figures. The teams are left to the game's own screen.
            36–50rem     two rows, about 120px: the portrait, the result line over the champion and
                         role, the K/D/A, the figures and the build; both teams under them.
            from 50rem   one row: the result column (Victory with the length, the queue, when with
                         the LP), the champion with its spells and runes from 54rem, the KDA, the
                         performance score over its place, the figures, the build, and the teams
                         from 65rem: narrower (1280 with the sidebar open), the build keeps the
                         teams' place and the rosters go first (UD.H1; the breakdown's scoreboard
                         has them). The tiers' density is D8's.
          The wide thresholds follow from the row's real minimum width: the KDA and figure tracks
          are never narrower than their text (minmax(auto, …), each with a floor that the widest
          real value fits, "10 / 10 / 10" and "1,234 dmg/min (45%)", so the columns stay level from
          card to card; the two-row card keeps the same floors), the champion's name has 6rem
          (6.25rem from 54rem, where the longest one-word name fits) and a second line, the teams
          keep their names (13rem), and the columns sit 10px apart until 70rem, where the wider
          gaps fit; so no text runs under the build or the teams. The teams' five lines set the
          wide card's height (about 100px). */}
      {/* The whole card opens and closes the match's breakdown under it. The player links in the
          teams cannot sit inside a button, so the card is a box: a click anywhere on it (but a
          link, or the LP's tooltip, which keeps its tap) toggles it, and one button behind the
          content is the card for the keyboard and screen readers (one stop per card, Enter or
          Space toggles it, its outline marks the card). */}
      <div
        className={cn("group cursor-pointer", matchCardClass(row.win, { interactive: true }), expanded && "rounded-b-none border-b-border/40")}
        onClick={(e) => {
          if ((e.target as Element).closest("a, [data-game-step]")) return;
          open.current!.focus({ preventScroll: true });
          onToggle(row.matchId);
        }}
        // A mouse press starts loading the match before the click lands (not touch: a finger that
        // goes down on a card is as often starting a scroll).
        onPointerDown={(e) => {
          if (!expanded && e.pointerType === "mouse" && e.button === 0 && !(e.target as Element).closest("a")) onPrefetch(row.matchId);
        }}
        data-testid="match-card"
      >
        <button
          ref={open}
          type="button"
          className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          aria-label={`${tone.word} on ${champion.name}, ${row.queue}, ${when}${row.lp ? `, ${lpSpoken(row.lp)}` : ""}${scoreSpoken}${multikill ? `, ${multikill.toLowerCase()}` : ""}. ${expanded ? "Hide" : "Show"} the match details.`}
          aria-describedby={row.teams ? teamsId : undefined}
          aria-expanded={expanded}
          aria-controls={expanded ? regionId : undefined}
          data-testid="match-row"
          data-match={row.matchId}
          data-result={row.win ? "W" : "L"}
          data-score-state={row.performance.state}
          data-score={scored?.score}
          data-rank={scored?.rank}
        />
        <MatchRail win={row.win} />
        {expanded ? (
          // The open game's card folds into its header (about 50px): the result, when, the LP and
          // the champion, then Previous, Next and Close. The loadout, figures, build and teams are
          // the view's below, said once.
          <span className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-2 pr-1.5 sm:pl-3" data-testid="match-card-header">
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className={cn("text-md font-bold", tone.text)}>{tone.word}</span>
              <span className="truncate text-sm font-semibold text-fg">
                {champion.name}
                {roleName ? <span className="font-normal text-fg-muted"> · {roleName}</span> : null}
              </span>
              {/* The game's score and place, as its card showed them, before the view below has loaded. */}
              {scored ? <ScoreMark score={scored} badge="card" className="self-center" testId="match-header-score" badgeTestId="match-header-placement" /> : null}
              <span className="whitespace-nowrap text-xs tabular-nums text-fg-subtle" suppressHydrationWarning>
                {fmtDuration(row.durationS)} · {row.queue} · {when}
              </span>
              {/* The open game's header: a tab stop of its own, so a keyboard reaches what the LP rests on (TT.TD12).
                  Above the card's own button (relative z-10, as the steps are), so a pointer or a tap
                  reaches it too instead of closing the game. */}
              {row.lp ? <LpChange lp={row.lp} dense focusable className="relative z-10" /> : null}
            </span>
            <GameSteps nav={nav} onClose={() => onToggle(row.matchId)} where="header" />
          </span>
        ) : (
          <span className={CARD_GRID} data-testid="match-card-grid">
          {/* The result column: Victory or Defeat with the length, the queue, then when with a ranked game's LP after it. */}
          <MatchResult win={row.win} queue={row.queue} when={when} duration={fmtDuration(row.durationS)} extra={row.lp ? <LpChange lp={row.lp} dense /> : null} className="hidden @min-[50rem]/mh:flex" />
          {/* A phone's first line, across the card (36–50rem: over the champion, below). */}
          {metaLine("col-[1/-1] row-[1] mb-0.5 flex @min-[36rem]/mh:hidden")}
          <ChampionLoadout champion={champion} spells={row.spells} keystone={row.keystone} secondary={row.secondary} level={row.champLevel} size="md" icon={22} className={PHONE_PORTRAIT} testId="match-loadout" portraitClassName="@max-[16rem]/mh:h-10 @max-[16rem]/mh:w-10 @min-[50rem]/mh:h-14 @min-[50rem]/mh:w-14" iconsClassName="@max-[54rem]/mh:hidden" />
          {/* The result line (36–50rem: a wide card has its result column, a phone's card its first
              line), then the champion, the role, the account it was played on and the team members
              in the game. On a phone the box steps aside (display: contents): the champion sits
              beside the portrait. */}
          <span className="min-w-0 leading-snug @max-[36rem]/mh:contents">
            {/* A two-row card's result line, over the champion (a phone's is its first line, above). */}
            {metaLine("hidden @min-[36rem]/mh:flex @min-[50rem]/mh:hidden")}
            {/* The champion, then the role and account: one line on a phone's card (the name keeps up
                to 70% of it, the role and account give way); on a two-row card one line where both
                fit, else the role takes the next line, so the whole box is the name's (a 36rem list
                keeps "Nunu & Willump" whole); two lines on wide cards. On a wide card a long name
                takes a second line ("Nunu &" / "Willump") rather than lose its end: four lines still
                fit beside the teams' five. The whole name is its hover text. */}
            <span className="col-[2] row-[2] block min-w-0">
              {/* Under 16rem (a large text size) the name wraps rather than lose its end, the role under it. */}
              <span className="block @max-[50rem]/mh:flex @max-[50rem]/mh:min-w-0 @max-[50rem]/mh:items-center @max-[50rem]/mh:gap-x-2 @max-[16rem]/mh:flex-wrap @min-[36rem]/mh:flex-wrap">
                <span className="block truncate text-md font-semibold text-fg @max-[36rem]/mh:max-w-[70%] @max-[36rem]/mh:shrink-0 @max-[16rem]/mh:max-w-full @max-[16rem]/mh:whitespace-normal @max-[16rem]/mh:[overflow-wrap:anywhere] @min-[50rem]/mh:line-clamp-2 @min-[50rem]/mh:whitespace-normal" title={champion.name} data-testid="match-champion">
                  {champion.name}
                </span>
                <span className="flex min-w-0 items-center gap-1 text-xs text-fg-muted">
                  {row.role ? <RoleIcon role={row.role as Role} className="h-3.5 w-3.5 shrink-0" /> : null}
                  <span className="truncate">{roleName ?? "Role not recorded"}</span>
                  {account ? (
                    <span className="ml-0.5 truncate rounded bg-surface-2 px-1.5 py-px text-2xs text-fg-subtle" title={`Played on ${row.riotId}`} data-testid="match-row-account">
                      {account}
                    </span>
                  ) : null}
                </span>
              </span>
              {members.with.length || members.against.length ? (
                <span className="block truncate text-2xs" title={[members.with.length ? `With team members: ${members.with.map((m) => m.name).join(", ")}` : null, members.against.length ? `Against team members: ${members.against.map((m) => m.name).join(", ")}` : null].filter(Boolean).join(". ")} data-testid="match-members" data-with={members.with.length} data-against={members.against.length}>
                  {members.with.length ? (
                    <span className="text-fg-subtle">
                      With{" "}
                      <span className="font-medium text-fg-muted">
                        <MemberNames names={members.with.map((m) => m.name)} />
                      </span>
                    </span>
                  ) : null}
                  {members.with.length && members.against.length ? <span className="text-fg-subtle"> · </span> : null}
                  {members.against.length ? <span className="text-fg-muted">Against <MemberNames names={members.against.map((m) => m.name)} /></span> : null}
                </span>
              ) : null}
            </span>
          </span>
          {/* KDA: the primary performance figure. From 36rem its track is at least as wide as
              "10 / 10 / 10", the widest K/D/A a real game gives (digits are tabular, so every line
              of three two-digit numbers is that wide), and as wide as its text whenever that is
              wider: the floor keeps the columns level from card to card. The floor is in em, so it
              follows the text's size (16px below 54rem, larger from 54rem) and the reader's text
              size, with room to spare: Inter sets "10 / 10 / 10" at 5.71em, and browser builds
              differ by a pixel or two (CI's measured 1.5px more than a local one against a floor of
              5.78em). 6em leaves about 5% (6.25em until 25 Nov 2026, when the performance column after it needed the room). A phone's card caps the column at that K/D/A instead
              (5.75rem), so a longer ratio line ("details not collected") wraps under it rather than
              take the build's room. */}
          <span className={cn("text-right @min-[36rem]/mh:text-left", "leading-tight @min-[50rem]/mh:leading-snug", PHONE_KDA)}>
            <span className={cn("block whitespace-nowrap text-base font-semibold tabular-nums text-fg @min-[36rem]/mh:min-w-[6em] @min-[54rem]/mh:text-lg", "leading-tight @min-[50rem]/mh:leading-snug")} data-testid="match-kda">
              {kda}
            </span>
            <span className={cn("block text-xs tabular-nums", row.perfect ? "text-good" : "text-fg-muted")}>{ratio}</span>
            {/* The performance score and place directly under the K/D/A on a phone's and a two-row card (a wide card gives them the next column). */}
            <span className="mt-0.5 flex justify-end @max-[16rem]/mh:mt-0 @min-[36rem]/mh:justify-start @min-[50rem]/mh:hidden">{scoreMark("inline")}</span>
            {/* The game's largest multikill, quietly (see MultikillTag), no taller than its text under the score on a phone's and a two-row card. */}
            {row.multikill ? (
              <span className="mt-0.5 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 @min-[36rem]/mh:justify-start">
                <MultikillTag size={row.multikill} dense className="@min-[50rem]/mh:leading-tight" />
              </span>
            ) : null}
          </span>
          {/* A wide card's performance column: the score over its place, centred in a track of one width on every card. */}
          <span className="hidden items-center justify-center @min-[50rem]/mh:flex" data-testid="match-score-cell">
            {scoreMark("stack")}
          </span>
          {/* From 21.375 to 36rem the build is drawn here, under the champion beside the K/D/A and above
              the figures, so it is read here too (PHONE_BUILD_BESIDE). */}
          {unrecorded ? null : <span className={PHONE_BUILD_BESIDE}>{itemRow("grid-cols-[repeat(7,auto)]", "order-last ml-0.5")}</span>}
          {/* Kill participation, CS and damage: secondary, one line on a phone's card, one per line
              from 36rem; each with its total or share. Then at most one "best" figure, with the
              figures on every card: beside the KDA it widened that column (on a narrow card it cut
              the queue and time off the line beside it; on a wide one it pushed the columns after it
              out of line). */}
          <span className={cn("flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted @min-[36rem]/mh:flex-col @min-[36rem]/mh:gap-y-px", PHONE_FIGURES)} data-testid="match-figures">
            <Stat label="KP" value={kp} className={PHONE_KP} testId="match-kp" />
            <span className={PHONE_FIGURES_REST}>
              <Stat label="CS/min" value={fmtNum(row.csPerMin)} extra={row.cs === null ? null : formatCount(row.cs)} testId="match-cs" />
              <Stat label="dmg/min" value={fmtInt(row.damagePerMin)} extra={row.damageShare === null ? null : `${Math.round(row.damageShare * 100)}%`} testId="match-damage" />
              {standoutChip("self-center @min-[36rem]/mh:mt-px @min-[36rem]/mh:self-start")}
            </span>
          </span>
          {/* The build: a phone's card's last line under 21.375rem (from there to 36rem the copy before
              the figures is shown instead), a compact block of two rows from 36rem: at the end of a two-row card's first row, and on wide cards in its own
              column (from 50 to 65rem in the teams' place, which the breakdown's scoreboard then holds). A build that was not
              recorded draws nothing (screen readers hear it; the page's data status counts these
              games), and a card from 36rem keeps the build's room, so its columns stay level with the
              cards around it. */}
          {unrecorded ? (
            <>
              {build}
              <span className="hidden @min-[36rem]/mh:block @min-[36rem]/mh:w-[5.875rem]" />
            </>
          ) : (
            <span className={cn("flex items-center overflow-hidden", PHONE_BUILD)} data-testid="match-card-build">
              {build}
            </span>
          )}
          {/* Both teams; without the full record, a quiet note instead of empty slots. A phone's card
              leaves them to the game's own screen (its scoreboard lists all ten), so a screenful
              holds several games instead of two; a two-row card gives them its second row. */}
          <span className="hidden min-w-0 @min-[36rem]/mh:col-[1/-1] @min-[36rem]/mh:block @min-[50rem]/mh:col-auto @min-[50rem]/mh:@max-[65rem]/mh:hidden" data-testid="match-card-teams">
            {teams ? (
              <TeamComposition teams={teams} champion={champ} queueId={row.queueId} id={teamsId} />
            ) : (
              <span className="block text-xs text-fg-subtle" data-testid="match-teams-missing">
                {row.record === "missing" ? "Teams being collected" : "Teams not provided by Riot"}
              </span>
            )}
          </span>
          {/* The chevron: decoration (the whole card is the button), left out from 65 to 74rem, where the teams need its room. */}
          <ChevronRight className={cn("hidden h-4 w-4 text-fg-subtle transition-transform motion-reduce:transition-none @min-[50rem]/mh:block @min-[65rem]/mh:@max-[74rem]/mh:hidden", expanded ? "rotate-90 text-fg" : "group-hover:translate-x-0.5 group-hover:text-fg")} aria-hidden />
        </span>
        )}
      </div>
      {expanded ? (
        <MatchExpansion
          id={regionId}
          label={`${tone.word} on ${champion.name}: match details`}
          playerId={playerId}
          matchId={row.matchId}
          champ={champ}
          nav={nav}
          fit={fit}
          onClose={() => onToggle(row.matchId)}
        />
      ) : null}
    </li>
  );
});

/** Team members on a card: every name, or on a narrow card the first and how many more (all of them in the line's hover text and the scoreboard). */
function MemberNames({ names }: { names: string[] }) {
  return (
    <>
      <span className="@max-[36rem]/mh:hidden">{names.join(", ")}</span>
      <span className="hidden @max-[36rem]/mh:inline">
        {names[0]}
        {names.length > 1 ? ` +${names.length - 1}` : ""}
      </span>
    </>
  );
}

/**
 * A figure, its label and its total or share, on one line. From 36rem (a column of figures) the
 * figures' track is at least as wide as "1,234 dmg/min (45%)" (the floor keeps the columns level from
 * card to card) and as wide as the text whenever that is wider: never narrower than the text, so it
 * cannot run under the build or the teams.
 */
function Stat({ label, value, extra = null, className, testId }: { label: string; value: string; /** A quieter figure after it: the total or the share. */ extra?: string | null; className?: string; testId?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-wrap items-baseline gap-x-1 leading-snug @min-[36rem]/mh:min-w-[8.125rem]", className)} data-testid={testId}>
      <span className="font-semibold tabular-nums text-fg">{value}</span>
      <span className="whitespace-nowrap">{label}</span>
      {extra ? <span className="whitespace-nowrap tabular-nums text-fg-subtle">({extra})</span> : null}
    </span>
  );
}

const NO_CHECKED: Record<string, ReadonlyMap<number, ParticipantRank>> = {};

/** A participant whose champion Riot did not record. */
const UNKNOWN_CHAMPION: PortraitChampion = { id: "unknown", name: "Unknown champion", portraitUrl: "" };

/** A champion missing from the static data, by id (kept per id so memoised cards stay equal). */
const noopSubscribe = () => () => {};

const fallbacks = new Map<string, PortraitChampion>();
function fallbackChampion(id: string): PortraitChampion {
  let c = fallbacks.get(id);
  if (!c) fallbacks.set(id, (c = { id, name: id, portraitUrl: "" }));
  return c;
}

const noSubscribe = () => () => {};
const no = () => false;
function subscribePosture(onChange: () => void) {
  const query = window.matchMedia(WINDOW_POSTURE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
/**
 * Pointer and posture decide how a game opens (components/ui/posture.ts): a touch phone, upright or
 * sideways, a narrow window and a short one get the match window; every other screen the game under
 * its card. Asked only while a game is open, so the list does not render twice once it has hydrated.
 */
function useWindowPostureWhile(enabled: boolean): boolean {
  return React.useSyncExternalStore(enabled ? subscribePosture : noSubscribe, enabled ? prefersWindow : no, no);
}

/**
 * Match History: the player's stored Riot games, newest first, ten a page (PER_PAGE_DEFAULT; a
 * window with room below the list's top for more than ten whole cards, a portrait monitor, gets as
 * many as fit, up to 25; phones always ten). The list scrolls with the page. Above the games, a
 * line about the newest of them (HistorySummaryStrip); the filters are the profile's Overview's
 * (season and mode up front, role, champions and account behind Refine). A game opens under its
 * card (one at a time: the scoreboard, analysis, timeline and build), so the list stays where it
 * is and the next game is one click away. The open game is kept in the address (?match=, replaced,
 * not added to the history); a link to a game that is not on the page shown opens it in the
 * shared match window instead. With `encounter`, the same list holds one player's games met in
 * Encounters (encounter-games: the way back, their records, and the side to list) instead of the
 * line about the newest games; the season, game mode and account still apply.
 */
export function MatchHistoryView({ data, championsById, basePath, playerId, playerName, status, refresh, encounter }: { data: MatchHistoryPage; championsById: Record<string, PortraitChampion>; basePath: string; playerId: string; /** The profile's name, in a player met's records. */ playerName: string; /** The page's data status (domain/data-status). */ status?: DataStatus | null; /** Offered to the player and to those who manage Riot accounts, where Riot can be asked. */ refresh?: DataRefreshTarget | null; /** One player's games, opened from Encounters (Match History → Encounters). */ encounter?: EncounterGamesFocus }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Interactive once hydrated (data-ready, which browser tests wait for). A link followed before
  // then is a full page load, and the page size chosen on arrival below would overtake it.
  const interactive = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [pending, startTransition] = React.useTransition();
  const listRef = React.useRef<HTMLDivElement>(null);
  // The open game: from a card (it opens under the card, and closes if a refresh takes it off the
  // page) or from a link (?match= on arrival or Back/Forward: under its card when it is on the
  // page, else in the match window).
  const [open, setOpen] = React.useState<{ id: string; via: "card" | "link" | "step" } | null>(() => {
    const id = params.get("match");
    return id ? { id, via: "link" } : null;
  });
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };
  // One function for every card's team icons (stable while the champions are, so memoised cards stay equal).
  const champOrUnknown = React.useCallback((id: string | null): PortraitChampion => (id ? (championsById[id] ?? fallbackChampion(id)) : UNKNOWN_CHAMPION), [championsById]);
  const onPage = React.useMemo(() => new Set(data.rows.map((r) => r.matchId)), [data.rows]);
  // Phones open a game as a whole screen of its own (the match window, which Back closes) instead of
  // under its card: a breakdown inside a list is a long detour on a narrow screen. Asked only while a
  // game is open, so the list does not render twice on a phone once it has hydrated.
  const phone = useWindowPostureWhile(open !== null);
  const inline = open && onPage.has(open.id) && !phone ? open.id : null;
  const windowed = open && (phone || (open.via === "link" && !onPage.has(open.id))) ? open.id : null;
  // The game this page added to the browser's history when a phone opened it, so closing it is Back.
  const pushed = React.useRef<string | null>(null);
  // A link from the open game to this list's other views (a mark on its scoreboard leads to that
  // player's games) changes the list under it: the game closes. Back returns to it, as the address
  // still names it there.
  const listKey = React.useMemo(() => {
    const q = new URLSearchParams(params.toString());
    q.delete("match");
    return q.toString();
  }, [params]);
  const [shownList, setShownList] = React.useState(listKey);
  if (shownList !== listKey) {
    setShownList(listKey);
    if (open && params.get("match") !== open.id) setOpen(null);
  }

  // A new list (a page, a filter) while a game this page opened was open: that history entry becomes
  // the new list's, on purpose, so Back returns to the list as it was before the game opened.
  React.useEffect(() => {
    pushed.current = null;
  }, [listKey]);

  const latestParams = React.useRef({ params, pathname });
  React.useLayoutEffect(() => {
    latestParams.current = { params, pathname };
  });
  /**
   * The open game in the address. Under its card it replaces the current entry (Back leaves the
   * page, not the game); on a phone, where the game takes the whole screen, it is a new entry, so
   * Back (the button, the gesture, Android's key) closes it and returns to the list as it was.
   */
  const writeMatch = React.useCallback((matchId: string | null, { push = false }: { push?: boolean } = {}) => {
    const { params, pathname } = latestParams.current;
    const next = new URLSearchParams(params.toString());
    if (matchId) next.set("match", matchId);
    else next.delete("match");
    const url = `${pathname}${next.size ? `?${next.toString()}` : ""}`;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);

  const go = React.useCallback(
    (patch: Record<string, string | null>, { keepMatch = false }: { keepMatch?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!keepMatch) {
        next.delete("match");
        setOpen(null);
      }
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  // The page size: ten (phones always), or as many whole cards as the room below the list's top
  // holds when that is more than ten (only very tall windows; up to 25). Cards are counted at the
  // first one's height as drawn: about 100px in one row, about 120px in two (a 36–50rem list, such
  // as a portrait monitor's with the sidebar open). Ten is also the server's default, so nearly
  // every arrival renders once.
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const phone = window.innerWidth < 768;
    const room = screenHeight() - el.getBoundingClientRect().top - 56;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const card = el.querySelector("[data-testid=match-card]");
    const rowPx = card ? card.getBoundingClientRect().height + GAP_REM * rem : ROW_REM * rem;
    const fits = phone ? PHONE_PER : Math.max(10, Math.min(25, Math.floor(room / rowPx)));
    if (fits !== data.per && data.total > 0) {
      const firstIndex = (data.page - 1) * data.per;
      // The game a link opened stays open (it is still on the new page, or opens in the window).
      go({ per: String(fits), page: String(Math.floor(firstIndex / fits) + 1) }, { keepMatch: true });
    }
    // Only on arrival and when the list changes size class, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.per, data.total]);

  // Ranks a breakdown checked with Riot, by match and place: its card shows them at once. They
  // belong to this page of data; the next one reads them from storage like every other rank.
  const [checked, setChecked] = React.useState<{ data: MatchHistoryPage; ranks: Record<string, ReadonlyMap<number, ParticipantRank>> }>({ data, ranks: {} });
  const checkedRanks = checked.data === data ? checked.ranks : NO_CHECKED;
  // Details this page has loaded (a new one with every new page of data, see MatchDetailCache).
  const cache = React.useMemo<MatchDetailCache>(
    () =>
      createMatchDetailCache({
        onRanks: (matchId, r) => {
          if (r.status !== "ok" || !r.check.found) return;
          const ranks = new Map(r.ranks.map((x) => [x.slot, x.rank]));
          setChecked((prev) => ({ data, ranks: { ...(prev.data === data ? prev.ranks : {}), [matchId]: ranks } }));
        },
      }),
    [data],
  );
  const prefetch = React.useCallback((matchId: string) => void cache.load(playerId, matchId).catch(() => {}), [cache, playerId]);
  // A player met in other games, from an open game's scoreboard: their games here, in the list's
  // season, game mode and account (the counts the scoreboard showed).
  const { season, mode, accountId } = data.filter;
  const encounterLink = React.useMemo<EncounterLink>(() => ({ scope: { season, mode, accountId }, href: (key: string) => `${basePath}?${statsQuery({ season, mode, accountId }, { view: "encounters", ...encounterFocusParams({ key, side: "all" }) })}` }), [basePath, season, mode, accountId]);
  const openRef = React.useRef(open);
  React.useLayoutEffect(() => {
    openRef.current = open;
  });
  // Set when a card opens, so the card is brought into view once it has (see below).
  const reveal = React.useRef<string | null>(null);
  // Switching games keeps the new game's card where the clicked card (or the open game's header)
  // was on the screen: its top is recorded before the change, and the page scrolled by the
  // difference before the browser paints (see below), so nothing jumps under the pointer.
  const anchor = React.useRef<{ id: string; top: number } | null>(null);
  // Two frames: after a phone's window has unlocked the page and handed the focus back to its opener.
  const focusCard = (matchId: string) =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const li = document.getElementById(`match-${matchId}`);
        bringBack(li);
        li?.querySelector<HTMLElement>("[data-testid=match-row]")?.focus({ preventScroll: true });
      }),
    );
  /** Another game in place of the open one: the address is replaced (one history entry for the whole visit). */
  const switchTo = React.useCallback(
    (matchId: string, keep: HTMLElement | null) => {
      // A phone's window steps over a list it hides: nothing to hold in place there.
      anchor.current = keep && !prefersWindow() ? { id: matchId, top: keep.getBoundingClientRect().top } : null;
      reveal.current = null;
      // "step": its card is held where the open one's header was, so the game is not moved into view (InlineMatch's fit).
      setOpen({ id: matchId, via: "step" });
      if (pushed.current) pushed.current = matchId;
      writeMatch(matchId);
    },
    [writeMatch],
  );
  /**
   * One history rule, as for every item a list opens: opening a game adds one entry (so Back closes
   * it, on a desktop as on a phone), switching to another replaces it, and closing goes Back when
   * this page added it.
   */
  const toggle = React.useCallback(
    (matchId: string) => {
      const current = openRef.current?.id ?? null;
      if (current && current !== matchId && !prefersWindow()) {
        switchTo(matchId, document.getElementById(`match-${matchId}`));
        return;
      }
      if (current === matchId) {
        if (pushed.current === matchId) {
          pushed.current = null;
          window.history.back();
        } else {
          setOpen(null);
          writeMatch(null);
        }
        focusCard(matchId);
        return;
      }
      anchor.current = null;
      setOpen({ id: matchId, via: "card" });
      reveal.current = matchId;
      pushed.current = matchId;
      writeMatch(matchId, { push: true });
    },
    [writeMatch, switchTo],
  );
  React.useLayoutEffect(() => {
    const a = anchor.current;
    if (!inline || !a || a.id !== inline) return;
    anchor.current = null;
    const el = document.getElementById(`match-${inline}`);
    if (!el) return;
    return holdInPlace(el, a.top);
  }, [inline]);
  // An opened card that sits low on the screen, or above it (the game open before it closed and
  // the list moved up), is scrolled to the top so its breakdown is in view; one already in the
  // upper part of the screen stays where it is.
  React.useLayoutEffect(() => {
    if (!inline || reveal.current !== inline) return;
    reveal.current = null;
    revealOpened(document.getElementById(`match-${inline}`));
  }, [inline]);
  /** The open game's neighbours on this page, for Previous and Next (the window's, on a phone, and the card's). */
  const rowIds = React.useMemo(() => data.rows.map((r) => r.matchId), [data.rows]);
  // The new game takes the place of the open one's header on the screen.
  const step = React.useCallback((matchId: string) => switchTo(matchId, openRef.current ? document.getElementById(`match-${openRef.current.id}`) : null), [switchTo]);
  const navFor = (matchId: string | null): GameNav | null => {
    const i = matchId ? rowIds.indexOf(matchId) : -1;
    return i < 0 ? null : { prev: rowIds[i - 1] ?? null, next: rowIds[i + 1] ?? null, go: step };
  };
  const returnFocus = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (windowed) returnFocus.current = document.activeElement as HTMLElement | null;
  }, [windowed]);
  const closeWindow = () => {
    // A game a phone opened from its card closes the way it came: Back (which the list follows below).
    if (pushed.current && pushed.current === windowed) {
      pushed.current = null;
      window.history.back();
      return;
    }
    setOpen(null);
    writeMatch(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  };
  // Back and Forward follow the address: the game it names opens (under its card when on the page).
  React.useEffect(() => {
    const onPop = () => {
      const id = new URLSearchParams(window.location.search).get("match");
      if (pushed.current !== id) pushed.current = null;
      const was = openRef.current?.id ?? null;
      setOpen(id ? { id, via: "link" } : null);
      // Back closed a game (under its card, or a phone's window): the list is on that card, and the focus on it.
      if (!id && was) focusCard(was);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const f = data.filter;
  const narrowed = f.role || f.scope !== "all" || f.accountId || f.mode !== "all" || f.season !== data.currentSeason || narrowsGames(data.refine);
  // What Refine narrows or groups: on a tablet its chips show under the filters (the header's toolbar then takes a row of its own).
  const refined = !!(f.role || f.scope !== "all" || f.accountId || narrowsGames(data.refine) || data.refine.sessions);
  // Refine's own choices ride along every change of the shared filters (a player's games keep the
  // player, their side and the way back); a change of them starts again at the newest games.
  const keep = encounter ? { per: String(data.per), view: "encounters", ...encounterListParams(encounter.list), ...encounterFocusParams(encounter.focus) } : { per: String(data.per), ...refineParams(data.refine) };
  const refineTo = (patch: Record<string, string | null>) => go({ ...patch, page: null });
  // Grouping keeps the page and an open game: the games and their order stay the same.
  const groupTo = (sessions: boolean) => go({ group: sessions ? "sessions" : null }, { keepMatch: true });
  // The page's games by playing session, when grouped (a session cut by the page break shows its part here).
  const sessionGroups = data.refine.sessions && data.rows.length ? groupBySession(data.rows, data.sessionOf) : null;
  const inlineNav = navFor(inline);
  // A phone's window over the list: Previous and Next step through this page's games.
  const windowAt = windowed ? rowIds.indexOf(windowed) : -1;
  const windowNav = phone && windowAt >= 0 ? { prev: rowIds[windowAt - 1] ?? null, next: rowIds[windowAt + 1] ?? null, go: step, index: windowAt, total: rowIds.length } : null;
  const card = (r: MatchRow) => <MatchCard key={r.matchId} row={r} playerId={playerId} champion={championsById[r.championId] ?? fallbackChampion(r.championId)} champ={champOrUnknown} onToggle={toggle} onPrefetch={prefetch} nav={inline === r.matchId ? inlineNav : null} expanded={inline === r.matchId} fit={inline === r.matchId && open?.via !== "step"} checked={checkedRanks[r.matchId]} />;

  return (
    <section className="space-y-3" aria-labelledby="match-history" data-testid="match-history" data-accounts-linked={data.accountsLinked} data-total={data.total} data-ready={interactive ? "true" : undefined}>
      {/* Match History's one header (shared with Encounters): Games | Encounters, the data status,
          and the toolbar: the filters (the scope they set is readable in them), then Refresh; then
          a line about the newest games (or the player met whose games these are), then the games.
          Season totals and averages belong to the profile's Overview. */}
      <MatchHistoryHeader
        view={encounter ? "encounters" : "games"}
        basePath={basePath}
        filter={f}
        description={
          // What the list holds, in one line, as on Encounters and All Champions.
          <p className="text-sm text-fg-muted" data-testid="match-scope">
            {formatCount(data.total)} game{data.total === 1 ? "" : "s"} · {scopeText(f, data.accountOptions, data.accountsLinked)}
          </p>
        }
        status={status ? <DataStatusNote status={status} refresh={refresh} /> : null}
        statusAfterText
        narrowed={!!narrowed || data.refine.sessions}
        refined={refined}
        refresh={status ? <RefreshButton status={status} refresh={refresh ? { ...refresh, onNewGames: data.page > 1 ? { label: "Show the newest", run: () => go({ page: "1" }) } : undefined } : null} compact /> : null}
        controls={
          <div aria-busy={pending} className="min-w-0">
            {encounter ? (
              // A player's games: the season, game mode and account Encounters counts them in.
              <OverviewFilters basePath={basePath} filter={f} seasons={data.seasons} currentSeason={data.currentSeason} champions={[]} accounts={data.accountOptions} keep={keep} resetQuery={new URLSearchParams(keep).toString()} modeCounts={data.modes.counts} showChampions={false} showRole={false} compactToggle testId="match-filters" />
            ) : (
              <OverviewFilters
                basePath={basePath}
                filter={f}
                seasons={data.seasons}
                currentSeason={data.currentSeason}
                champions={data.championOptions.map((c) => ({ id: c.id, name: champ(c.id).name, games: c.games, portraitUrl: champ(c.id).portraitUrl }))}
                accounts={data.accountOptions}
                keep={keep}
                modeCounts={data.modes.counts}
                compactToggle
                testId="match-filters"
                refineLabel="Refine the games"
                extraFields={<HistoryRefineFields refine={data.refine} options={data} set={refineTo} group={groupTo} pending={pending} />}
                extraRefinements={historyRefinements(data.refine, data, refineTo, groupTo)}
              />
            )}
          </div>
        }
      />

      {encounter ? <EncounterGamesPanel basePath={basePath} filter={f} encounter={encounter} playerName={playerName} /> : data.summary ? <HistorySummaryStrip summary={data.summary} ladder={data.ladder} championsById={championsById} /> : null}

      <MatchDetailCacheContext.Provider value={cache}>
        <EncounterLinkContext.Provider value={encounterLink}>
          <div ref={listRef} className={cn("transition-opacity", pending && "opacity-60")}>
            {data.total === 0 ? (
              <p className="rounded-panel border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted" data-testid="match-empty">
                {encounter ? "No recorded game with this player matches these filters." : data.accountsLinked === 0 ? "No Riot account is linked yet: games appear here once one is linked and synced." : narrowed ? "No stored game matches these filters." : data.syncing ? "No games stored for this season yet; the first sync is collecting them and this page fills in by itself." : "No games stored for this season."}
                <ModeElsewhere basePath={basePath} filter={f} elsewhere={data.modes.elsewhere} keep={keep} />
              </p>
            ) : sessionGroups ? (
              <ol className="@container/mh space-y-4" aria-label={`Playing sessions, page ${data.page} of ${data.pages}`} data-testid="match-sessions">
                {sessionGroups.map((g) => {
                  const summary = data.sessions[g.key];
                  return (
                    <li key={g.key} className="space-y-1.5" data-testid="session" data-games={summary?.games ?? g.rows.length}>
                      {summary ? <SessionHeader summary={summary} onPage={g.rows.length} /> : null}
                      <ol className="space-y-1.5">{g.rows.map(card)}</ol>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <ol className="@container/mh space-y-1.5" aria-label={`Page ${data.page} of ${data.pages}`}>
                {data.rows.map(card)}
              </ol>
            )}
          </div>

          {data.pages > 1 ? (
            <Pages
              page={data.page}
              pages={data.pages}
              total={data.total}
              per={data.per}
              pending={pending}
              go={(p) => {
                go({ page: String(p) });
                // The next page starts with its first game, just under the bars (scroll padding, and a
                // phone's sliding bar as it comes back: scrollToStart): the pager sits at the list's
                // end, where the new page would otherwise open at its last game.
                if (listRef.current) scrollToStart(listRef.current);
              }}
            />
          ) : null}

          {windowed ? <MatchDetailModal playerId={playerId} matchId={windowed} championsById={championsById} onClose={closeWindow} encounterLinks={phone} nav={windowNav} lp={data.rows.find((r) => r.matchId === windowed)?.lp ?? null} /> : null}
        </EncounterLinkContext.Provider>
      </MatchDetailCacheContext.Provider>
    </section>
  );
}

/** The page's games in their playing sessions, in the page's order (sessions are runs of the list, newest first). */
function groupBySession(rows: readonly MatchRow[], sessionOf: Readonly<Record<string, string>>): Array<{ key: string; rows: MatchRow[] }> {
  const groups: Array<{ key: string; rows: MatchRow[] }> = [];
  for (const r of rows) {
    const key = sessionOf[r.matchId] ?? r.matchId;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, rows: [r] });
  }
  return groups;
}

/** "29 Oct, 7:12 pm – 10:40 pm · 5 games · 3W 2L · 3.21 KDA · 7.4 CS/min · 2 h 10 min played" (wins and losses in the cards' colours). */
function SessionHeader({ summary: s, onPage }: { summary: SessionSummary; onPage: number }) {
  const minutes = Math.round(s.minutes);
  const played = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 text-xs text-fg-muted" data-testid="session-header">
      <h3 className="text-sm font-semibold text-fg">
        {formatDayMonth(s.start)}, {formatTimeOfDay(s.start)} – {formatTimeOfDay(s.end)}
      </h3>
      <span className="tabular-nums">
        {formatCount(s.games)} {s.games === 1 ? "game" : "games"} · <span className="text-blue">{formatCount(s.wins)}W</span> <span className="text-red">{formatCount(s.losses)}L</span>
      </span>
      {s.kda !== null ? <span className="tabular-nums">{s.perfect ? "Perfect KDA" : `${formatNumber(s.kda, 2)} KDA`}</span> : null}
      {s.csPerMinute !== null ? <span className="tabular-nums">{formatNumber(s.csPerMinute, 1)} CS/min</span> : null}
      {minutes > 0 ? <span className="tabular-nums">{played} played</span> : null}
      {onPage < s.games ? <span className="text-fg-subtle">{formatCount(onPage)} of them on this page</span> : null}
    </div>
  );
}

/**
 * Compact page controls: arrows, the ends and the neighbourhood of the current page. Their targets
 * are 44px on a touch screen (a finger, phones and tablets alike), 32px with a mouse from md and
 * 40px below it. A phone too narrow for every button on one line (a middle page of a long history,
 * up to seven buttons) leaves the pages either side of the current one to the arrows, so both
 * arrows stay on the line, at its ends (pager.ts); buttons wrap only past that (very large text).
 */
function Pages({ page, pages, total, per, pending, go }: { page: number; pages: number; total: number; per: number; pending: boolean; go: (p: number) => void }) {
  const arrow = "grid h-10 w-10 place-items-center rounded-lg border border-border text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11 md:pointer-fine:h-8 md:pointer-fine:w-8";
  const from = (page - 1) * per + 1;
  const to = Math.min(total, page * per);
  const items = pagerItems(page, pages);
  const fold = pagerFold(items);
  const gap = (key: string, className?: string) => (
    <span key={key} className={cn("px-0.5 text-fg-subtle", className)} aria-hidden>
      …
    </span>
  );
  return (
    <nav aria-label="Match history pages" className="@container/pages flex flex-wrap items-center justify-center gap-x-3 gap-y-1" data-testid="match-pages">
      <span className="flex flex-wrap items-center justify-center gap-1">
        <button type="button" disabled={page <= 1 || pending} onClick={() => go(page - 1)} className={arrow} aria-label="Newer games" data-testid="match-prev">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        {items.map((item, i) =>
          "gap" in item ? (
            gap(`g${i}`)
          ) : (
            <React.Fragment key={item.page}>
              {item.jump ? gap(`j${item.page}`, fold.show) : null}
              <button type="button" aria-current={item.page === page ? "page" : undefined} aria-label={`Page ${item.page}`} onClick={() => go(item.page)} className={cn("h-10 min-w-10 rounded-lg px-1.5 text-sm tabular-nums pointer-coarse:h-11 pointer-coarse:min-w-11 md:pointer-fine:h-8 md:pointer-fine:min-w-8", item.page === page ? "bg-accent/15 font-semibold text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg", item.folds && fold.hide)}>
                {item.page}
              </button>
            </React.Fragment>
          ),
        )}
        <button type="button" disabled={page >= pages || pending} onClick={() => go(page + 1)} className={arrow} aria-label="Older games" data-testid="match-next">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </span>
      <span className="text-xs tabular-nums text-fg-subtle">
        Games {from}–{to} of {formatCount(total)}
      </span>
    </nav>
  );
}
