"use client";

import * as React from "react";
import type { ChampionRow } from "@/server/players/overview";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { MULTIKILL_KINDS, multikillCoverage } from "@/domain/multikills";
import { MULTIKILL_HELP, MULTIKILL_SHORT } from "./multikill-summary";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateSampleNote, winRateTone } from "@/domain/stats/win-rate";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { InfoTip } from "@/components/ui/info-tip";
import { RoleIcon } from "@/components/role-icon";
import { formatCompactCount, formatCount, formatKilo, percent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { roleFigures, roleRecordWords, type RoleFigures } from "./champion-roles";
import { Matchups } from "./champion-matchups";
import { SampleNote } from "./sample-note";
import type { PreviewData } from "./preview-data";

export { PREVIEW_KEYS, previewFrom, selectionFor, usePreviewAddress, usePreviewData, cacheFor, answerFrom, type AnswerCache, type ListScope, type PreviewSelection, type PreviewData } from "./preview-data";

/*
  All Champions' preview (the owner's request of 25 Nov 2026; docs/MATCHUPS.md): one champion,
  in one of the positions the player actually played it in, and the player's record against each
  lane opponent there. The same content beside the list (the docked pane, all-champions.tsx) and in a
  phone's sheet:

    identity    the portrait and name, "In pool", and the champion's mastery, marked as all
                positions' (Riot counts mastery per champion, never per position)
    position    every position played, most games first, each with its games, win rate and record
                (what a list icon's tooltip says, for every pointer): a choice switches every figure
                below and the opponents at once (the address's `crole`, replaced)
    figures     that position's games, win rate and W/L, KDA, CS/min, damage/min and vision, and its
                kills and multikills on one line; what they are averaged over
    opponents   every lane opponent in that position (champion-matchups.tsx)

  In All Champions' one-screen workspace (layout "workspace", docs/MATCHUPS.md) the same content is a
  horizontal summary in bands: P1 the identity bar (a 36px portrait, the name, the one position as
  words, In pool, the mastery, ‹ › and Close on one line), the positions where there are two or
  more (with the games in all after them), P3 the five figure cells, P4 the kills and multikills
  (with the coverage only where the averages are partial); then the opponents fill the rest of the
  card. Every figure is kept; only what repeats what is on screen is read out instead of drawn. The
  classes are `ws:` ones (globals.css), so the server's HTML is reshaped by CSS until the page knows,
  and the sheet (inside the section too) is never reshaped: it is always the flow layout.
*/

const record = (wins: number, games: number) => `${formatCount(wins)}W ${formatCount(games - wins)}L`;
const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;

export interface PreviewProps {
  playerId: string;
  isOwn: boolean;
  row: ChampionRow;
  /** The position shown (one of the row's), or null for a champion no game of which records a position. */
  role: Role | null;
  vs: string | null;
  champ: (id: string) => PortraitChampion;
  data: PreviewData;
  onVs: (vs: string | null) => void;
  onRole: (role: Role) => void;
  onMatch: (matchId: string) => void;
  titleId: string;
  /** "pane": beside the list, naming the champion in its own heading with its controls; "sheet": a phone's window, whose header names it. */
  chrome: "pane" | "sheet";
  /** The pane's controls (‹ › and Close), at the identity's right. */
  controls?: React.ReactNode;
  /** The opponents from which their table offers its search (OPPONENT_SEARCH_FROM unless a browser test on the demo names fewer). */
  searchFrom?: number;
  /** "workspace": the one-screen pane (the `ws` variant reshapes it until the page knows; never the sheet); "flow" elsewhere. */
  layout?: "workspace" | "flow";
  /** The workspace measured: its lists show their pages. */
  paged?: boolean;
  /** A browser test's cap on the opponents (and games) a column shows. */
  perColumnCap?: number | null;
}

/** One figure: its label, the figure, and what it is per (or what it is made of). */
function Figure({ label, value, sub, testId }: { label: string; value: string; sub: string | null; testId: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <dt className="label-text truncate">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold leading-tight tabular-nums text-fg">{value}</dd>
      <dd className="truncate text-xs tabular-nums text-fg-muted">{sub ?? " "}</dd>
    </div>
  );
}

/** Items of a line that wraps between them only (the space after each, outside them): each whole ("0 quadra"), its " ·" inside it (no break in a nowrap item), so the dot ends the line it ends and never starts the next. */
const SEP = " ·";

/**
 * The kills and the four multikills, on one line where it fits: each count with its word, "*" where
 * only some of the games are counted so far and "not counted yet" where none is (never a zero for
 * unknown). Where the line wraps (a phone, a tablet's sheet), it wraps between items only: "0 quadra"
 * and "0 penta" stay whole and every "·" ends its line (the owner's review of 25 Nov 2026: "… · 0
 * quadra · 0" / "penta").
 */
function KillsLine({ f, workspace = false, after }: { f: RoleFigures; workspace?: boolean; after?: React.ReactNode }) {
  const p = f.performance;
  const m = f.multikills;
  const partial = (done: number, of: number) => (done < of ? "*" : "");
  const kills = p.totalKills === null ? "—" : `${formatCount(p.totalKills)}${partial(p.detailedGames, f.selected.games)}`;
  const kinds = !m || !m.games ? null : !m.counted ? null : MULTIKILL_KINDS.map((k) => `${formatCount(m[k.key])} ${MULTIKILL_SHORT[k.key].toLowerCase()}`);
  const multi = !m || !m.games ? null : !m.counted ? ["not counted yet"] : kinds!.map((w, i) => (i === kinds!.length - 1 ? `${w}${partial(m.counted, m.games)}` : w));
  const some = (p.totalKills !== null && p.detailedGames < f.selected.games) || (!!m && m.counted > 0 && m.counted < m.games);
  return (
    <p className="text-sm tabular-nums text-fg-muted" data-testid="champion-preview-kills">
      <span className="whitespace-nowrap" data-kills-item="">
        Kills <span className="font-semibold text-fg">{kills}</span>
        {multi ? SEP : null}
      </span>
      {multi ? " " : null}
      {multi
        ? multi.map((w, i) => (
            <React.Fragment key={i}>
              {/* The label stays with the first kind ("Multikills 2 double"). */}
              <span className="whitespace-nowrap" data-kills-item="">
                {i === 0 ? "Multikills " : null}
                <span className="text-fg">{w}</span>
                {i < multi.length - 1 ? SEP : null}
              </span>
              {i < multi.length - 1 ? " " : null}
            </React.Fragment>
          ))
        : null}
      {some ? <span className="sr-only"> (* from some of the games only: {m ? multikillCoverage(m).label.toLowerCase() : "the rest still loading"})</span> : null}
      {workspace && some ? (
        // The workspace: the list's legend for these marks, at the line's end (its words and its ⓘ).
        <span className="hidden whitespace-nowrap text-xs text-fg-muted ws:inline-flex ws:items-center ws:gap-1" data-testid="champion-preview-partial">
          <span aria-hidden>
            {" · "}
            <span className="font-semibold text-warn">*</span> only some games counted so far
          </span>
          <InfoTip text={MULTIKILL_HELP} label="About multikills" />
        </span>
      ) : null}
      {after}
    </p>
  );
}

/** The position's record and averages (each over the games that carry it). */
function Figures({ f, role, champion, workspace = false, tail }: { f: RoleFigures; role: Role | null; champion: string; workspace?: boolean; tail?: React.ReactNode }) {
  const r = f.selected;
  const p = f.performance;
  const one = (v: number | null) => (v === null ? null : v.toFixed(1));
  const kda = [one(p.kills), one(p.deaths), one(p.assists)];
  const tone = WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)];
  const partial = p.detailedGames < r.games;
  return (
    <section aria-label={role ? `${champion} as ${ROLE_LABELS[role]}` : `${champion}'s games`} className={cn("flex flex-col gap-3", workspace && "ws:mt-3 ws:gap-2")} data-testid="champion-preview-record">
      <div className="grid grid-cols-2 items-start gap-x-6 gap-y-3 @min-[34rem]/detail:grid-cols-[auto_repeat(4,minmax(0,1fr))]" data-testid="champion-preview-figures">
        <div className="col-span-2 flex items-baseline gap-x-3 @min-[34rem]/detail:col-span-1 @min-[34rem]/detail:block">
          <p className="label-text @max-[34rem]/detail:sr-only">Win rate</p>
          <p className={cn("text-3xl font-bold leading-none tabular-nums @min-[34rem]/detail:mt-0.5", workspace && "ws:text-2xl", tone)} data-testid="champion-preview-winrate">
            {r.winRate === null ? "—" : percent(r.winRate, 0)}
            <SampleNote note={winRateSampleNote(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)} />
          </p>
          <p className={cn("text-sm text-fg-muted @min-[34rem]/detail:mt-1", workspace && "ws:mt-0.5 ws:text-xs")} data-testid="champion-preview-record-line">
            <span className="font-semibold tabular-nums text-fg">{formatCount(r.games)}</span> game{r.games === 1 ? "" : "s"} · {record(r.wins, r.games)}
          </p>
        </div>
        <dl className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-3 @min-[28rem]/detail:grid-cols-4 @min-[34rem]/detail:col-span-4" data-testid="champion-preview-stats">
          <Figure label="KDA" value={p.perfectKda ? "Perfect" : p.kdaRatio === null ? "—" : p.kdaRatio.toFixed(2)} sub={kda.every((x) => x !== null) ? kda.join(" / ") : null} testId="champion-stat-kda" />
          <Figure label="CS/min" value={p.csPerMinute === null ? "—" : p.csPerMinute.toFixed(1)} sub={p.csPerGame === null ? null : `${formatCount(Math.round(p.csPerGame))} a game`} testId="champion-stat-cs" />
          <Figure label="Damage/min" value={p.damagePerMinute === null ? "—" : formatCount(Math.round(p.damagePerMinute))} sub={p.damagePerGame === null ? null : `${formatKilo(Math.round(p.damagePerGame))} a game`} testId="champion-stat-damage" />
          <Figure label="Vision" value={p.visionPerGame === null ? "—" : p.visionPerGame.toFixed(1)} sub={p.visionPerGame === null ? null : "a game"} testId="champion-stat-vision" />
        </dl>
      </div>
      <div className={cn("flex flex-col gap-1", workspace && "ws:flex-row ws:flex-wrap ws:items-baseline ws:gap-x-3 ws:gap-y-0.5")}>
        <KillsLine f={f} workspace={workspace} after={workspace ? tail : null} />
        {/* The workspace draws it only where the averages are partial: complete, it repeats the win rate's games, the position and the scope line, and is read out instead. */}
        <p className={cn("text-xs text-fg-subtle", workspace && !partial && "ws:sr-only")} data-testid="champion-preview-coverage">
          {role
            ? partial
              ? `Averages from the ${plural(p.detailedGames, "game")} with a full record, of ${formatCount(r.games)} ${ROLE_LABELS[role]} games.`
              : `Averages over ${r.games === 1 ? `the one ${ROLE_LABELS[role]} game` : `all ${formatCount(r.games)} ${ROLE_LABELS[role]} games`} in these filters.`
            : partial
              ? `Averages from the ${plural(p.detailedGames, "game")} with a full record, of ${formatCount(r.games)}.`
              : `Averages over ${r.games === 1 ? "the one game" : `all ${formatCount(r.games)} games`} in these filters.`}
        </p>
      </div>
    </section>
  );
}

/**
 * Every position the champion was played in, most games first: one choice switches the whole preview
 * to it. With two or more, each says what a list icon's tooltip says, for every pointer (a touch
 * screen has no hover): the position and its games ("Top 22"), and under them its win rate and record
 * ("50% · 11W 11L", the win rate quiet under 5 games). With one, the figures right under it are that
 * position's, so it shows the position alone (the owner's review of 25 Nov 2026: "Support 9 / 56% ·
 * 5W 4L" sat right above "56% / 9 games · 5W 4L"). Its accessible name says the record in words either way.
 */
function Positions({ row, role, onRole, champion, workspace = false, after }: { row: ChampionRow; role: Role | null; onRole: (role: Role) => void; champion: string; workspace?: boolean; after?: React.ReactNode }) {
  if (!row.roles.length) return null;
  const several = row.roles.length > 1;
  return (
    // The workspace: one position is said in the identity bar (nothing to choose), so this row is for two or more.
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", workspace && (several ? "ws:mt-3" : "ws:hidden"))} data-testid="champion-preview-positions">
      <span className={cn("label-text", workspace && "ws:sr-only")} id={`positions-${row.championId}`}>
        Position
      </span>
      <div role="radiogroup" aria-labelledby={`positions-${row.championId}`} aria-describedby={`positions-${row.championId}-what`} className={segmentedGroupClass("-ml-3")} data-testid="champion-preview-roles">
        {row.roles.map((r) => {
          const on = role === r.role;
          const small = r.games < WIN_RATE_MIN_GAMES.champion;
          return (
            <button key={r.role} type="button" role="radio" aria-checked={on} onClick={() => !on && onRole(r.role)} className={segmentClass(on, { size: "md", className: cn("justify-start py-1.5 text-left", workspace && "ws:px-2 ws:after:inset-x-2") })} aria-label={`${ROLE_LABELS[r.role]}: ${roleRecordWords(r)}`} data-testid="champion-preview-role" data-role={r.role} data-games={r.games} data-wins={r.wins}>
              <span className="flex flex-col items-start gap-0.5 leading-tight">
                <span className="inline-flex items-center gap-1.5">
                  <RoleIcon role={r.role} decorative className="h-4 w-4" />
                  {ROLE_LABELS[r.role]}
                  {several ? <span className="text-xs tabular-nums">{formatCount(r.games)}</span> : null}
                </span>
                {several ? (
                  <span className="pl-5.5 text-xs font-normal tabular-nums" data-testid="champion-preview-role-record">
                    <span className={cn(small && "text-fg-subtle")}>{percent(r.wins / r.games, 0)}</span>
                    <span className={on ? "text-fg-muted" : "text-fg-subtle"}> · {record(r.wins, r.games)}</span>
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <span id={`positions-${row.championId}-what`} className="sr-only">
        {several ? `The positions ${champion} was played in, with the games, win rate and record in each.` : `The one position ${champion} was played in, with its games, win rate and record.`}
      </span>
      {after}
    </div>
  );
}

/**
 * The preview's content, the same beside the list and in a phone's sheet: who (the portrait, name,
 * "In pool" and mastery), the positions, the chosen position's figures, then its lane opponents.
 */
export function PreviewContent({ playerId, isOwn, row, role, vs, champ, data, onVs, onRole, onMatch, titleId, chrome, controls, searchFrom, layout = "flow", paged = false, perColumnCap = null }: PreviewProps) {
  const me = champ(row.championId);
  // The position's figures; for a champion no game of which records a position, its games in all.
  const figures = roleFigures(row, role) ?? (row.roles.length ? null : { selected: row.selected, performance: row.performance, multikills: row.multikills ?? null });
  const many = row.roles.length > 1 || row.noRole > 0;
  const pane = chrome === "pane";
  // The one-screen workspace's bands (never the sheet: it is drawn inside the section, where `ws:` would reach it).
  const ws = pane && layout === "workspace";
  const noRoleSentence = row.roles.length
    ? `${plural(row.noRole, "more game")} ${row.noRole === 1 ? "has" : "have"} no recorded position: ${row.noRole === 1 ? "it counts" : "they count"} in ${me.name}'s totals only.`
    : `${row.noRole === 1 ? "Its one game has" : `All ${formatCount(row.noRole)} of its games have`} no recorded position: the figures are ${row.noRole === 1 ? "that game's" : "those games'"}.`;
  const one = row.roles.length === 1 ? row.roles[0]! : null;
  // The workspace's totals: "29 games in all", and ", 1 with no recorded position" where some games record none (the sentence in its title and read out).
  const totals =
    ws && many && row.roles.length ? (
      <span className="whitespace-nowrap text-xs text-fg-muted" data-testid="champion-preview-total">
        <span className="font-semibold tabular-nums text-fg">{formatCount(row.selected.games)}</span> {row.selected.games === 1 ? "game" : "games"} in all
        {row.noRole > 0 ? (
          <span title={noRoleSentence} data-testid="champion-preview-no-role">
            <span aria-hidden>, {formatCount(row.noRole)} with no recorded position</span>
            <span className="sr-only">. {noRoleSentence}</span>
          </span>
        ) : null}
      </span>
    ) : null;
  // A champion of one position with games that record none: the totals end P4; one with no position at all keeps its sentence there.
  const tail = ws ? (
    one && totals ? (
      <>
        <span aria-hidden className="text-fg-subtle">
          {" · "}
        </span>
        {totals}
      </>
    ) : !row.roles.length && row.noRole > 0 ? (
      <span className="text-xs text-fg-subtle" data-testid="champion-preview-no-role">
        {" · "}
        {noRoleSentence}
      </span>
    ) : null
  ) : null;
  return (
    <div id="champion-preview" className={cn("@container/detail flex flex-col gap-4", ws && "ws:flex-1 ws:gap-0")} data-testid="champion-preview-content" data-champion={row.championId} data-role={role ?? ""}>
      {/* In the sheet (its controls are the window's), the identity goes under the portrait where less than 10rem is left beside
          it (a 320px phone at 200% text), rather than squeeze "Mastery 167K" past the sheet's edge. */}
      {/* The workspace's P1: one line where it fits (the portrait 36px), not pinned (nothing scrolls). */}
      <header className={cn("flex items-start gap-3", pane ? "sticky top-[calc(var(--bar-top)+var(--tabs-top))] z-[2] -mx-5 border-b border-border/70 bg-surface px-5 pb-3 pt-4" : "flex-wrap", ws && "ws:static ws:items-center ws:pb-2 ws:pt-2")} data-testid="champion-preview-header">
        <ChampionPortrait champion={me} size="md" className={cn("h-12 w-12 shrink-0 rounded-lg ring-1 ring-border-strong/60", ws && "ws:h-9 ws:w-9")} />
        <div className={cn("min-w-0", pane ? "flex-1" : "grow basis-40", ws && "ws:flex ws:flex-wrap ws:items-baseline ws:gap-x-3 ws:gap-y-0.5")}>
          {pane ? (
            <h2 id={titleId} tabIndex={-1} className="text-lg font-semibold leading-tight text-fg outline-none focus-visible:outline-2 focus-visible:outline-accent">
              <span className="sr-only">Champion: </span>
              {me.name}
            </h2>
          ) : null}
          <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-fg-muted", pane && "mt-1", ws && "ws:mt-0")} data-testid="champion-preview-identity">
            {ws && one ? (
              // One position: nothing to choose, so it is said here, its record in words (the figures under it are its own).
              <span className="hidden items-center gap-1 whitespace-nowrap text-fg ws:inline-flex" data-testid="champion-preview-position" data-role={one.role}>
                <RoleIcon role={one.role} decorative className="h-4 w-4" />
                {ROLE_LABELS[one.role]}
                <span className="sr-only">: {roleRecordWords(one)}</span>
              </span>
            ) : null}
            {row.poolRoles.length ? (
              <span className="whitespace-nowrap rounded-full border border-border-strong px-1.5 text-xs font-medium leading-5 text-fg-muted" data-testid="champion-preview-in-pool">
                In pool<span className="sr-only"> as {row.poolRoles.map((r) => ROLE_LABELS[r]).join(" and ")}</span>
              </span>
            ) : null}
            {row.mastery?.points ? (
              // Two whole pieces, "Mastery 167K" and "all positions": at a large text size on a narrow phone they wrap between
              // them rather than run past the sheet's edge (one unbreakable piece was cut at 320px and 200%).
              <span data-testid="champion-preview-mastery">
                <span className="whitespace-nowrap">
                  Mastery <span className="font-semibold tabular-nums text-fg">{formatCompactCount(row.mastery.points)}</span>
                </span>{" "}
                <span className="whitespace-nowrap text-fg-subtle">all positions</span>
              </span>
            ) : null}
            {many && !ws ? (
              <span className="whitespace-nowrap" data-testid="champion-preview-total">
                <span className="font-semibold tabular-nums text-fg">{formatCount(row.selected.games)}</span> {row.selected.games === 1 ? "game" : "games"} in all
              </span>
            ) : null}
          </p>
        </div>
        {controls}
      </header>
      <Positions row={row} role={role} onRole={onRole} champion={me.name} workspace={ws} after={row.roles.length > 1 ? totals : null} />
      {row.noRole > 0 && !ws ? (
        <p className="-mt-2 text-xs text-fg-subtle" data-testid="champion-preview-no-role">
          {noRoleSentence}
        </p>
      ) : null}
      {figures ? <Figures f={figures} role={role} champion={me.name} workspace={ws} tail={tail} /> : null}
      <Matchups key={row.championId} playerId={playerId} isOwn={isOwn} me={me} role={role} vs={vs} champ={champ} data={data} onVs={onVs} onMatch={onMatch} titleId={titleId} searchFrom={searchFrom} layout={ws ? "workspace" : "flow"} paged={ws && paged} perColumnCap={perColumnCap} />
    </div>
  );
}
