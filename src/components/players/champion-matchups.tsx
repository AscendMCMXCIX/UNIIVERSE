"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ScanSearch } from "lucide-react";
import type { Role } from "@/domain/roles";
import { ROLE_LABELS } from "@/domain/roles";
import { OPPONENT_MIN_GAMES, OPPONENT_SEARCH_FROM, OPPONENT_SORTS, OPPONENT_TONED_GAMES, arrangeOpponents, opponentFootLine, opponentSentence, pairingKda, searchOpponents, smallSample, type OpponentSort, type OpponentTally } from "@/domain/champion-preview";
import { WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { normalise } from "@/components/champions/types";
import { intelHref } from "@/components/champion-lookup/address";
import { SearchInput } from "@/components/ui/search-input";
import { InfoTip } from "@/components/ui/info-tip";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { formatCount, formatDayMonth, percent } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useAnswer, type PreviewData } from "./preview-data";

/*
  The preview's lane opponents (the owner's request of 25 Nov 2026): ONE table of every lane
  opponent the champion met in the chosen position, however few the games (no folds, no "more"
  toggles, no Best/Worst tabs), with a search by name and three orders: most games, highest win rate
  and lowest win rate. Under 3 games an opponent is a small sample: its win rate is quiet and the
  win-rate orders list it after the ranked ones, past a divider (domain/champion-preview).

  An opponent's detail (its games, their KDA, the lane at 10:00, the link to Champion Intel) is not
  an accordion: where the preview has room (a 38rem preview) it sits beside the table, and selecting
  another row replaces it; in a narrower preview (a phone's sheet, a tablet) it is one step in place
  of the table, with "All opponents" to go back. The opponent is `vs` in the address, replaced (the
  preview's one history entry: Back closes the preview, as everywhere else).
*/

/** The table's columns: the opponent, its games, its record and its win rate. */
const ROWS = "grid grid-cols-[minmax(0,1fr)_2.75rem_3.75rem_3.25rem] items-center gap-x-2";
/** The opponent's games: the result, K/D/A, CS, the gold difference at 10:00 and the date. */
const GAMES = "grid grid-cols-[1.5rem_minmax(0,1fr)_2.5rem_5.5rem_3.25rem] items-center gap-x-2";
const record = (wins: number, games: number) => `${formatCount(wins)}W ${formatCount(games - wins)}L`;
const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;
const SMALL_SAMPLE_TIP = `Fewer than ${OPPONENT_MIN_GAMES} games is a small sample: the win rate is greyed and the win-rate orders list it last.`;

export interface MatchupsProps {
  playerId: string;
  isOwn: boolean;
  me: PortraitChampion;
  /** The position shown; null for a champion no game of which records one (no lane opponent then). */
  role: Role | null;
  vs: string | null;
  champ: (id: string) => PortraitChampion;
  data: PreviewData;
  onVs: (vs: string | null) => void;
  onMatch: (matchId: string) => void;
  titleId: string;
  /** The opponents from which the table offers its search (OPPONENT_SEARCH_FROM; fewer only for a browser test on the demo). */
  searchFrom?: number;
}

export function Matchups({ playerId, isOwn, me, role, vs, champ, data, onVs, onMatch, titleId, searchFrom = OPPONENT_SEARCH_FROM }: MatchupsProps) {
  const key = role ? `${data.scopeKey}|${me.id}|${role}` : null;
  const init = data.initial.preview;
  const seed = init && role && init.champion === me.id && init.role === role ? init : null;
  const answer = useAnswer(key, data.generation, role ? () => data.preview(me.id, role) : null, seed);
  const preview = answer?.status === "ok" ? answer.data : null;
  // The order is a reading preference, kept across positions; the search belongs to the position it
  // was typed in (another position's table starts whole: a word left behind never hides an opponent).
  const [sort, setSort] = React.useState<OpponentSort>("games");
  const [search, setSearch] = React.useState<{ role: Role | null; text: string }>({ role, text: "" });
  // Another position: its search starts empty (React's "state from the previous render" pattern).
  if (search.role !== role) setSearch({ role, text: "" });
  const query = search.role === role ? search.text : "";
  const setQuery = (text: string) => setSearch({ role, text });
  const all = React.useMemo(() => preview?.opponents ?? [], [preview]);
  const searchable = all.length >= searchFrom;
  const found = React.useMemo(() => searchOpponents(all, { words: normalise(query.trim()), typedIn: search.role, role, name: (o) => normalise(champ(o.championId).name), from: searchFrom }), [all, query, search.role, role, champ, searchFrom]);
  const arranged = React.useMemo(() => arrangeOpponents(found, sort), [found, sort]);
  const open = vs ? (all.find((o) => o.championId === vs) ?? null) : null;
  const detailId = `opponent-${playerId.slice(0, 8)}-detail`;
  // In a narrow preview the detail takes the table's place: the focus follows it there and back.
  const tableRef = React.useRef<HTMLDivElement>(null);
  const backRef = React.useRef<HTMLButtonElement>(null);
  const lastRow = React.useRef<string | null>(null);
  // A row pressed: in a narrow preview its detail takes the table's place, and the focus goes with it.
  const follow = React.useRef(false);
  const stacked = () => !!tableRef.current && getComputedStyle(tableRef.current).display === "none";
  const pick = (id: string) => {
    lastRow.current = id;
    follow.current = vs !== id;
    onVs(vs === id ? null : id);
  };
  // "All opponents": the table back, the focus on the row it left from.
  const returnTo = React.useRef<string | null>(null);
  // Each is also brought into view where it is not (a row far down a long table opens a short step,
  // and the table it goes back to is as long as before): "nearest" scrolls only as far as needed, in
  // the sheet's body or the page (the pane scrolls with the page), clear of the pane's pinned header
  // (scroll-margin: the pane's --preview-head).
  React.useLayoutEffect(() => {
    if (vs && follow.current && stacked()) {
      backRef.current?.focus({ preventScroll: true });
      backRef.current?.scrollIntoView({ block: "nearest" });
    }
    follow.current = false;
    if (!vs && returnTo.current) {
      const row = tableRef.current?.querySelector<HTMLButtonElement>(`[data-opponent-row="${CSS.escape(returnTo.current)}"]`);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: "nearest" });
    }
    returnTo.current = null;
  }, [vs]);
  const back = () => {
    returnTo.current = lastRow.current ?? vs;
    onVs(null);
  };

  const heading = (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <h3 id={`${titleId}-opponents`} className="text-base font-semibold text-fg">
        Lane opponents
      </h3>
      {preview && all.length ? (
        <span className="text-sm tabular-nums text-fg-muted" data-testid="champion-preview-opponent-count">
          {formatCount(all.length)}
          {role ? <span className="sr-only"> as {ROLE_LABELS[role]}</span> : null}
        </span>
      ) : null}
      {preview && all.some(smallSample) ? <InfoTip text={SMALL_SAMPLE_TIP} label="About small samples" className="self-center" /> : null}
    </div>
  );

  let body: React.ReactNode;
  if (!role) {
    body = (
      <p className="text-sm text-fg-muted" data-testid="champion-preview-no-position">
        No game here records a position, so no lane opponent is known.
      </p>
    );
  } else if (!preview) {
    body =
      answer?.status === "not-found" ? (
        <p className="text-sm text-fg-muted">{answer.message}</p>
      ) : (
        <div className="flex flex-col gap-1" aria-hidden data-testid="champion-preview-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-surface-2/70" />
          ))}
        </div>
      );
  } else if (!all.length) {
    body = (
      <p className="text-sm text-fg-muted" data-testid="champion-preview-no-opponents">
        No lane opponent is known in these games yet.
      </p>
    );
  } else {
    body = (
      <div className="grid items-start gap-x-6 gap-y-3 @min-[38rem]/detail:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div ref={tableRef} className={cn("flex min-w-0 flex-col gap-2", open && "@max-[38rem]/detail:hidden")} data-testid="champion-preview-opponent-table">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {searchable ? <SearchInput value={query} onChange={setQuery} placeholder="Find an opponent…" label="Find a lane opponent" className="min-w-[9rem] flex-[1_1_10rem]" testId="opponent-search" /> : null}
            {all.length > 1 ? (
              <div role="radiogroup" aria-label="Order the opponents" className={segmentedGroupClass()}>
                {OPPONENT_SORTS.map((s) => (
                  <button key={s.key} type="button" role="radio" aria-checked={sort === s.key} onClick={() => setSort(s.key)} className={segmentClass(sort === s.key, { size: "sm" })} data-testid={`opponent-sort-${s.key}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <div className={cn(ROWS, "border-b border-border/60 px-2 pb-1.5")} aria-hidden data-testid="champion-preview-opponent-head">
              <span className="label-text">Opponent</span>
              <span className="label-text text-right">Games</span>
              <span className="label-text text-right">Record</span>
              <span className="label-text text-right">Win rate</span>
            </div>
            {arranged.rows.length ? (
              <ul className="flex flex-col" data-testid="champion-preview-opponent-list">
                {arranged.rows.map((o, i) => (
                  <React.Fragment key={o.championId}>
                    {arranged.divider === i ? (
                      <li className="border-t border-border/60 px-2 pb-1 pt-2 text-xs text-fg-subtle" data-testid="champion-preview-small-divider">
                        Fewer than {OPPONENT_MIN_GAMES} games: not ranked by win rate
                      </li>
                    ) : null}
                    <OpponentRow o={o} them={champ(o.championId)} selected={vs === o.championId} controls={detailId} onPick={() => pick(o.championId)} />
                  </React.Fragment>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-3 text-sm text-fg-muted" data-testid="champion-preview-no-match">
                No opponent matches “{query.trim()}”.
              </p>
            )}
          </div>
        </div>
        <div className={cn("min-w-0", !open && "hidden @min-[38rem]/detail:block")}>
          {open ? (
            <PairingDetail key={open.championId} id={detailId} me={me} them={champ(open.championId)} o={open} role={role} isOwn={isOwn} data={data} onMatch={onMatch} onBack={back} backRef={backRef} onClose={() => pick(open.championId)} />
          ) : (
            <p className="pt-2 text-sm text-fg-subtle" data-testid="champion-preview-pick-opponent">
              Choose an opponent to see each game against it and the lane at 10:00.
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <section aria-labelledby={`${titleId}-opponents`} className="flex flex-col gap-2.5" data-testid="champion-preview-opponents">
      {heading}
      {body}
      {preview && role ? (
        <p className="text-xs text-fg-subtle" data-testid="champion-preview-foot">
          {opponentFootLine({ isOwn, known: preview.known, games: preview.games })}
        </p>
      ) : null}
    </section>
  );
}

function OpponentRow({ o, them, selected, controls, onPick }: { o: OpponentTally; them: PortraitChampion; selected: boolean; controls: string; onPick: () => void }) {
  const rate = o.wins / o.games;
  const small = smallSample(o);
  return (
    <li data-testid="champion-preview-opponent" data-champion={o.championId} data-games={o.games} data-small={small || undefined}>
      <button
        type="button"
        aria-pressed={selected}
        aria-controls={selected ? controls : undefined}
        onClick={onPick}
        className={cn(
          ROWS,
          "relative min-h-9 w-full scroll-mt-(--preview-head) rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-11",
          selected && "bg-surface-3 hover:bg-surface-3 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-accent",
        )}
        data-opponent-row={o.championId}
      >
        <span className="flex min-w-0 items-center gap-2">
          <ChampionPortrait champion={them} size="xs" className="shrink-0 rounded" />
          <span className="min-w-0 truncate text-sm font-medium text-fg">{them.name}</span>
        </span>
        <span className="text-right text-sm tabular-nums text-fg" data-testid="opponent-games">
          {formatCount(o.games)}
          <span className="sr-only"> game{o.games === 1 ? "" : "s"}</span>
        </span>
        <span className="text-right text-xs tabular-nums text-fg-muted">{record(o.wins, o.games)}</span>
        <span className={cn("text-right text-sm font-semibold tabular-nums", small ? "text-fg-subtle" : o.games >= OPPONENT_TONED_GAMES ? WIN_RATE_TONE_CLASS[winRateTone(rate, o.games, OPPONENT_TONED_GAMES)] : "text-fg")} data-testid="opponent-win-rate">
          {percent(rate, 0)}
          {small ? <span className="sr-only"> (small sample)</span> : null}
        </span>
      </button>
    </li>
  );
}

/** One opponent's games against the champion in this position: their KDA, the lane at 10:00, each game, and Champion Intel. */
function PairingDetail({ id, me, them, o, role, isOwn, data, onMatch, onBack, backRef, onClose }: { id: string; me: PortraitChampion; them: PortraitChampion; o: OpponentTally; role: Role; isOwn: boolean; data: PreviewData; onMatch: (matchId: string) => void; onBack: () => void; backRef: React.Ref<HTMLButtonElement>; onClose: () => void }) {
  const key = `${data.scopeKey}|${me.id}|${role}|${them.id}`;
  const init = data.initial.pairing;
  const seed = init && init.champion === me.id && init.role === role && init.vs === them.id ? init : null;
  const answer = useAnswer(key, data.generation, () => data.pairing(me.id, role, them.id), seed);
  const pairing = answer?.status === "ok" ? answer.data : null;
  const sentence = pairing ? opponentSentence(pairing.ten, { isOwn, champion: me.name, opponent: them.name }) : null;
  const kda = pairing ? pairingKda(pairing.games) : null;
  const rate = o.wins / o.games;
  const small = smallSample(o);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-3" data-testid="champion-preview-pairing" data-champion={them.id}>
      {/* A narrow preview: this step replaces the table, and goes back to it. */}
      <button ref={backRef} type="button" onClick={onBack} className="-ml-1 inline-flex min-h-9 scroll-mt-(--preview-head) items-center gap-1 self-start rounded-md px-1 text-sm font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 @min-[38rem]/detail:hidden" data-testid="champion-preview-opponents-back">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        All opponents
      </button>
      <header className="flex items-center gap-3">
        <ChampionPortrait champion={them} size="sm" className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <h4 id={`${id}-title`} className="text-base font-semibold text-fg">
            <span className="font-normal text-fg-muted">vs </span>
            {them.name}
          </h4>
          <p className="text-sm tabular-nums text-fg-muted" data-testid="champion-preview-pairing-record">
            <span className="font-semibold text-fg">{plural(o.games, "game")}</span> · {record(o.wins, o.games)} ·{" "}
            <span className={cn("font-semibold", small ? "text-fg-subtle" : o.games >= OPPONENT_TONED_GAMES ? WIN_RATE_TONE_CLASS[winRateTone(rate, o.games, OPPONENT_TONED_GAMES)] : "text-fg")}>{percent(rate, 0)}</span>
            {small ? <span className="text-fg-subtle"> (small sample)</span> : null}
          </p>
        </div>
        {/* Beside the table: put the opponent back (the row again does the same). */}
        <button type="button" onClick={onClose} className="hidden min-h-9 shrink-0 items-center rounded-md px-2 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 @min-[38rem]/detail:inline-flex" data-testid="champion-preview-pairing-close">
          Clear
        </button>
      </header>
      {kda && pairing ? (
        <p className="text-sm tabular-nums text-fg-muted" data-testid="champion-preview-pairing-kda">
          <span className="font-semibold text-fg">{kda.perfect ? "Perfect KDA" : `KDA ${kda.ratio.toFixed(2)}`}</span> · {kda.kills.toFixed(1)} / {kda.deaths.toFixed(1)} / {kda.assists.toFixed(1)}{" "}
          <span className="text-fg-subtle">{kda.games === pairing.games.length ? (kda.games === 1 ? "in this game" : `over these ${formatCount(kda.games)} games`) : `over the ${plural(kda.games, "game")} with a full record`}</span>
        </p>
      ) : null}
      {sentence ? (
        <p className="text-sm text-fg-muted" data-testid="champion-preview-sentence">
          {sentence}
        </p>
      ) : null}
      {!pairing ? (
        answer?.status === "not-found" ? (
          <p className="text-sm text-fg-muted">{answer.message}</p>
        ) : (
          <div className="h-24 animate-pulse rounded-md bg-surface-2/70" aria-hidden />
        )
      ) : pairing.games.length ? (
        <div>
          <div className={cn(GAMES, "border-b border-border/60 px-1 pb-1.5")} aria-hidden>
            <span />
            <span className="label-text">K/D/A</span>
            <span className="label-text text-right">CS</span>
            <span className="label-text text-right">Gold at 10:00</span>
            <span className="label-text text-right">Date</span>
          </div>
          <ul className="flex flex-col" data-testid="champion-preview-games">
            {pairing.games.map((g) => (
              <li key={g.matchId}>
                <button type="button" onClick={() => onMatch(g.matchId)} className={cn(GAMES, "min-h-8 w-full rounded-md px-1 text-left text-sm tabular-nums transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-11")} data-testid="champion-preview-game">
                  <span className={cn("font-semibold", g.win ? "text-good" : "text-bad")}>
                    <span aria-hidden>{g.win ? "W" : "L"}</span>
                    <span className="sr-only">{g.win ? "Win" : "Loss"}</span>
                  </span>
                  <span className="truncate text-fg">{g.kills === null ? "—" : `${g.kills}/${g.deaths ?? 0}/${g.assists ?? 0}`}</span>
                  <span className="text-right text-fg">{g.cs === null ? "—" : formatCount(g.cs)}</span>
                  <span className={cn("text-right", g.gold10 === null ? "text-xs text-fg-subtle" : "text-fg")}>{g.gold10 === null ? (g.timeline === "frames" ? "—" : "no timeline") : `${g.gold10 > 0 ? "+" : g.gold10 < 0 ? "−" : "±"}${formatCount(Math.abs(Math.round(g.gold10)))}`}</span>
                  <span className="text-right text-xs text-fg-subtle">{formatDayMonth(g.playedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-fg-muted">These games could not be read yet.</p>
      )}
      <Link href={intelHref({ id: me.id, haste: 0 }, { id: them.id, haste: 0 })} prefetch={false} className="inline-flex min-h-9 items-center gap-1.5 self-start text-sm font-medium text-accent hover:underline pointer-coarse:min-h-11" data-testid="champion-preview-lookup">
        <ScanSearch className="h-4 w-4 shrink-0" aria-hidden />
        {me.name} and {them.name} in Champion Intel
      </Link>
    </section>
  );
}
