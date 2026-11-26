"use client";

import * as React from "react";
import type { ChampionRow } from "@/server/players/overview";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { MULTIKILL_KINDS, multikillCoverage } from "@/domain/multikills";
import { MULTIKILL_SHORT } from "./multikill-summary";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateSampleNote, winRateTone } from "@/domain/stats/win-rate";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleSegmentContent, segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { formatCompactCount, formatCount, formatKilo, percent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { roleFigures, type RoleFigures } from "./champion-roles";
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
    position    every position played, most games first, each with its games: a choice switches
                every figure below and the opponents at once (the address's `crole`, replaced)
    figures     that position's games, win rate and W/L, KDA, CS/min, damage/min and vision, and its
                kills and multikills on one line; what they are averaged over
    opponents   one table of every lane opponent in that position (champion-matchups.tsx)
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

/**
 * The kills and the four multikills, on one line: each count with its word, "*" where only some of
 * the games are counted so far and "not counted yet" where none is (never a zero for unknown).
 */
function KillsLine({ f }: { f: RoleFigures }) {
  const p = f.performance;
  const m = f.multikills;
  const partial = (done: number, of: number) => (done < of ? "*" : "");
  const kills = p.totalKills === null ? "—" : `${formatCount(p.totalKills)}${partial(p.detailedGames, f.selected.games)}`;
  const multi = !m || !m.games ? null : !m.counted ? "not counted yet" : `${MULTIKILL_KINDS.map((k) => `${formatCount(m[k.key])} ${MULTIKILL_SHORT[k.key].toLowerCase()}`).join(" · ")}${partial(m.counted, m.games)}`;
  const some = (p.totalKills !== null && p.detailedGames < f.selected.games) || (!!m && m.counted > 0 && m.counted < m.games);
  return (
    <p className="text-sm tabular-nums text-fg-muted" data-testid="champion-preview-kills">
      Kills <span className="font-semibold text-fg">{kills}</span>
      {multi ? (
        <>
          {" · "}Multikills <span className="text-fg">{multi}</span>
        </>
      ) : null}
      {some ? <span className="sr-only"> (* from some of the games only: {m ? multikillCoverage(m).label.toLowerCase() : "the rest still loading"})</span> : null}
    </p>
  );
}

/** The position's record and averages (each over the games that carry it). */
function Figures({ f, role, champion }: { f: RoleFigures; role: Role | null; champion: string }) {
  const r = f.selected;
  const p = f.performance;
  const one = (v: number | null) => (v === null ? null : v.toFixed(1));
  const kda = [one(p.kills), one(p.deaths), one(p.assists)];
  const tone = WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)];
  const partial = p.detailedGames < r.games;
  return (
    <section aria-label={role ? `${champion} as ${ROLE_LABELS[role]}` : `${champion}'s games`} className="flex flex-col gap-3" data-testid="champion-preview-record">
      <div className="grid grid-cols-2 items-start gap-x-6 gap-y-3 @min-[34rem]/detail:grid-cols-[auto_repeat(4,minmax(0,1fr))]" data-testid="champion-preview-figures">
        <div className="col-span-2 flex items-baseline gap-x-3 @min-[34rem]/detail:col-span-1 @min-[34rem]/detail:block">
          <p className="label-text @max-[34rem]/detail:sr-only">Win rate</p>
          <p className={cn("text-3xl font-bold leading-none tabular-nums @min-[34rem]/detail:mt-0.5", tone)} data-testid="champion-preview-winrate">
            {r.winRate === null ? "—" : percent(r.winRate, 0)}
            <SampleNote note={winRateSampleNote(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)} />
          </p>
          <p className="text-sm text-fg-muted @min-[34rem]/detail:mt-1" data-testid="champion-preview-record-line">
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
      <div className="flex flex-col gap-1">
        <KillsLine f={f} />
        <p className="text-xs text-fg-subtle" data-testid="champion-preview-coverage">
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

/** Every position the champion was played in, most games first: one choice switches the whole preview to it. */
function Positions({ row, role, onRole, champion }: { row: ChampionRow; role: Role | null; onRole: (role: Role) => void; champion: string }) {
  if (!row.roles.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="label-text" id={`positions-${row.championId}`}>
        Position
      </span>
      <div role="radiogroup" aria-labelledby={`positions-${row.championId}`} aria-describedby={`positions-${row.championId}-what`} className={segmentedGroupClass("-ml-2.5")} data-testid="champion-preview-roles">
        {row.roles.map((r) => (
          <button key={r.role} type="button" role="radio" aria-checked={role === r.role} onClick={() => role !== r.role && onRole(r.role)} className={segmentClass(role === r.role, { size: "md" })} aria-label={`${ROLE_LABELS[r.role]}: ${plural(r.games, "game")}`} data-testid="champion-preview-role" data-role={r.role}>
            <RoleSegmentContent role={r.role} active={role === r.role} compactLabel={false} count={r.games} />
          </button>
        ))}
      </div>
      <span id={`positions-${row.championId}-what`} className="sr-only">
        The positions {champion} was played in, with the games in each.
      </span>
    </div>
  );
}

/**
 * The preview's content, the same beside the list and in a phone's sheet: who (the portrait, name,
 * "In pool" and mastery), the positions, the chosen position's figures, then its lane opponents.
 */
export function PreviewContent({ playerId, isOwn, row, role, vs, champ, data, onVs, onRole, onMatch, titleId, chrome, controls }: PreviewProps) {
  const me = champ(row.championId);
  // The position's figures; for a champion no game of which records a position, its games in all.
  const figures = roleFigures(row, role) ?? (row.roles.length ? null : { selected: row.selected, performance: row.performance, multikills: row.multikills ?? null });
  const many = row.roles.length > 1 || row.noRole > 0;
  const pane = chrome === "pane";
  return (
    <div id="champion-preview" className="@container/detail flex flex-col gap-4" data-testid="champion-preview-content" data-champion={row.championId} data-role={role ?? ""}>
      <header className={cn("flex items-start gap-3", pane && "sticky top-0 z-[2] -mx-5 border-b border-border/70 bg-surface px-5 pb-3 pt-4")} data-testid="champion-preview-header">
        <ChampionPortrait champion={me} size="md" className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-border-strong/60" />
        <div className="min-w-0 flex-1">
          {pane ? (
            <h2 id={titleId} tabIndex={-1} className="text-lg font-semibold leading-tight text-fg outline-none focus-visible:outline-2 focus-visible:outline-accent">
              <span className="sr-only">Champion: </span>
              {me.name}
            </h2>
          ) : null}
          <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-fg-muted", pane && "mt-1")} data-testid="champion-preview-identity">
            {row.poolRoles.length ? (
              <span className="whitespace-nowrap rounded-full border border-border-strong px-1.5 text-xs font-medium leading-5 text-fg-muted" data-testid="champion-preview-in-pool">
                In pool<span className="sr-only"> as {row.poolRoles.map((r) => ROLE_LABELS[r]).join(" and ")}</span>
              </span>
            ) : null}
            {row.mastery?.points ? (
              <span className="whitespace-nowrap" data-testid="champion-preview-mastery">
                Mastery <span className="font-semibold tabular-nums text-fg">{formatCompactCount(row.mastery.points)}</span> <span className="text-fg-subtle">all positions</span>
              </span>
            ) : null}
            {many ? (
              <span className="whitespace-nowrap" data-testid="champion-preview-total">
                <span className="font-semibold tabular-nums text-fg">{formatCount(row.selected.games)}</span> {row.selected.games === 1 ? "game" : "games"} in all
              </span>
            ) : null}
          </p>
        </div>
        {controls}
      </header>
      <Positions row={row} role={role} onRole={onRole} champion={me.name} />
      {row.noRole > 0 ? (
        <p className="-mt-2 text-xs text-fg-subtle" data-testid="champion-preview-no-role">
          {row.roles.length
            ? `${plural(row.noRole, "more game")} ${row.noRole === 1 ? "has" : "have"} no recorded position: ${row.noRole === 1 ? "it counts" : "they count"} in ${me.name}'s totals only.`
            : `${row.noRole === 1 ? "Its one game has" : `All ${formatCount(row.noRole)} of its games have`} no recorded position: the figures are ${row.noRole === 1 ? "that game's" : "those games'"}.`}
        </p>
      ) : null}
      {figures ? <Figures f={figures} role={role} champion={me.name} /> : null}
      <Matchups key={row.championId} playerId={playerId} isOwn={isOwn} me={me} role={role} vs={vs} champ={champ} data={data} onVs={onVs} onMatch={onMatch} titleId={titleId} />
    </div>
  );
}
