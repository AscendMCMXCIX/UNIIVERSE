"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ScanSearch } from "lucide-react";
import type { OverviewCard } from "@/server/players/overview";
import type { ChampionPreviewData, PairingGamesData, PreviewScope } from "@/server/players/champion-preview";
import type { PreviewResult } from "@/server/actions/champion-preview";
import { getChampionPreviewAction, getPairingGamesAction } from "@/server/actions/champion-preview";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { isGameRole } from "@/domain/season-stats";
import { OPPONENTS_SHOWN, OPPONENT_MIN_GAMES, OPPONENT_SORTS, OPPONENT_TONED_GAMES, arrangeOpponents, opponentFootLine, opponentSentence, pairingKda, type OpponentSort, type OpponentTally } from "@/domain/champion-preview";
import { MULTIKILL_KINDS, multikillCoverage } from "@/domain/multikills";
import { MULTIKILL_SHORT } from "./multikill-summary";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { lookupHref } from "@/components/champion-lookup/address";
import { formatCompactCount, formatCount, formatDate, formatKilo, percent } from "@/lib/format";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";

/*
  All Champions' preview (PLAN S5, CM §4): one champion in one role, and the player's record against
  each lane opponent. A compact panel docked at the window's right edge beside the list (the overlay
  kit's Peek: docs/DESIGN_SYSTEM.md §7, since Release 16), so the list never moves; its opponents a
  dense table, an opened opponent's games under its row in the same panel. Touch phones and short
  windows get the same content as a sheet (posture.ts).

  The address holds it (?champion=&crole=[&vs=]): the first open pushes one history entry,
  switching champion or opponent replaces it, and closing goes Back when this page pushed it, so
  Back always closes and never walks through champions. Nothing re-renders the page: the address
  changes through the History API, and the content comes from two light server actions, kept per
  page.
*/

export interface PreviewSelection {
  championId: string;
  role: Role | null;
  vs: string | null;
}

/** The preview's address parameters (old links' `tab` included, so closing drops it). */
export const PREVIEW_KEYS: readonly string[] = ["champion", "crole", "vs", "tab"];

export function previewFrom(sp: URLSearchParams): PreviewSelection | null {
  const championId = sp.get("champion");
  if (!championId) return null;
  const role = sp.get("crole");
  return { championId, role: isGameRole(role) ? role : null, vs: sp.get("vs") };
}

/** The row a selection describes: its role's row, or the champion's most played one. */
export function cardFor(rows: readonly OverviewCard[], sel: PreviewSelection): OverviewCard | null {
  const own = rows.filter((c) => c.championId === sel.championId);
  return (sel.role ? own.find((c) => c.role === sel.role) : null) ?? [...own].sort((a, b) => b.selected.games - a.selected.games)[0] ?? null;
}

/** The preview's place in the address and in history. */
export function usePreviewAddress() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const urlKey = sp.toString();
  const sel = React.useMemo(() => previewFrom(new URLSearchParams(urlKey)), [urlKey]);
  // Opened from this page: closing goes back in history (so Back never reopens it).
  const pushed = React.useRef(false);
  const urlWith = React.useCallback(
    (changes: Record<string, string | null>) => {
      const q = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) q.delete(k);
        else q.set(k, v);
      }
      return `${pathname}${q.size ? `?${q.toString()}` : ""}`;
    },
    [pathname],
  );
  const hrefFor = (championId: string, role: Role) => {
    const q = new URLSearchParams(urlKey);
    q.set("champion", championId);
    q.set("crole", role);
    q.delete("vs");
    q.delete("tab");
    return `${pathname}?${q.toString()}`;
  };
  const show = (championId: string, role: Role) => {
    const url = urlWith({ champion: championId, crole: role, vs: null, tab: null });
    // From the address as it is now, not the last render's: two quick clicks push once.
    if (new URLSearchParams(window.location.search).has("champion")) window.history.replaceState(null, "", url);
    else {
      pushed.current = true;
      window.history.pushState(null, "", url);
    }
  };
  const setVs = (vs: string | null) => window.history.replaceState(null, "", urlWith({ vs, tab: null }));
  const close = () => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else window.history.replaceState(null, "", urlWith(Object.fromEntries(PREVIEW_KEYS.map((k) => [k, null]))));
  };
  // Back closed it: a later open pushes again.
  React.useEffect(() => {
    if (!sel) pushed.current = false;
  }, [sel]);
  return { sel, hrefFor, show, setVs, close };
}

type Loader<T> = (key: string, run: () => Promise<PreviewResult<T>>) => Promise<PreviewResult<T>>;

/** The answers kept for one generation of the list's data, seeded with the server's. */
export interface AnswerCache<T> {
  generation: unknown;
  store: Map<string, Promise<PreviewResult<T>>>;
}

/**
 * The cache for `generation` (the list's data as the server last rendered it): the one in hand while
 * the data is the same, so switching back to a champion asks nothing again; a new one, seeded with
 * the new render's answers, once a server render brings new data (a refresh after new games: the
 * page's FreshnessWatcher). Kept across refreshes, an answer would disagree with the refreshed figures
 * above it (the opponents and "Known in X of Y games" against "N games · W L").
 */
export function cacheFor<T>(current: AnswerCache<T> | null, generation: unknown, seed: Array<[string, T]>): AnswerCache<T> {
  if (current && current.generation === generation) return current;
  return { generation, store: new Map(seed.map(([k, data]) => [k, Promise.resolve({ status: "ok", data } as PreviewResult<T>)])) };
}

/** The answer for `key`: the one kept, or `run`'s, kept only when it is an answer (a refusal or a failed load is asked again next time). */
export function answerFrom<T>(cache: AnswerCache<T>, key: string, run: () => Promise<PreviewResult<T>>): Promise<PreviewResult<T>> {
  const { store } = cache;
  const hit = store.get(key);
  if (hit) return hit;
  const p = run().catch(() => ({ status: "not-found", message: "This champion's games could not be loaded." }) as PreviewResult<T>);
  store.set(key, p);
  void p.then((r) => {
    if (r.status !== "ok" && store.get(key) === p) store.delete(key);
  });
  return p;
}

/** One answer per key while the list's data stays the same (cacheFor). */
function useCache<T>(seed: Array<[string, T]>, generation: unknown): Loader<T> {
  const [held, setHeld] = React.useState(() => cacheFor<T>(null, generation, seed));
  const cache = cacheFor(held, generation, seed);
  if (cache !== held) setHeld(cache);
  return React.useCallback((key, run) => answerFrom(cache, key, run), [cache]);
}

export type ListScope = Omit<PreviewScope, "champion" | "role">;
const keyOf = (scope: ListScope, champion: string, role: Role, vs?: string) => JSON.stringify([scope.season, scope.mode, scope.account, champion, role, vs ?? null]);

/**
 * The preview's data: loaded through the actions, kept while the list's data stays the same, seeded
 * by the server's render. `generation` is that data as rendered (a refresh brings a new one).
 */
export function usePreviewData(playerId: string, scope: ListScope, initial: { preview: ChampionPreviewData | null; pairing: PairingGamesData | null }, generation: unknown) {
  const previews = useCache<ChampionPreviewData>(initial.preview ? [[keyOf(scope, initial.preview.champion, initial.preview.role), initial.preview]] : [], generation);
  const pairings = useCache<PairingGamesData>(initial.pairing ? [[keyOf(scope, initial.pairing.champion, initial.pairing.role, initial.pairing.vs), initial.pairing]] : [], generation);
  const preview = React.useCallback((champion: string, role: Role) => previews(keyOf(scope, champion, role), () => getChampionPreviewAction(playerId, { ...scope, champion, role })), [previews, playerId, scope]);
  const pairing = React.useCallback((champion: string, role: Role, vs: string) => pairings(keyOf(scope, champion, role, vs), () => getPairingGamesAction(playerId, { ...scope, champion, role }, vs)), [pairings, playerId, scope]);
  return React.useMemo(() => ({ preview, pairing, initial, generation, scopeKey: JSON.stringify([scope.season, scope.mode, scope.account]) }), [preview, pairing, initial, generation, scope]);
}

/**
 * An answer for exactly this key, or null while it loads. A new generation of the list's data asks
 * again (the refreshed render's answer, or the action), showing the answer it has until then.
 */
function useAnswer<T>(key: string | null, generation: unknown, load: (() => Promise<PreviewResult<T>>) | null, seed: T | null): PreviewResult<T> | null {
  const [got, setGot] = React.useState<{ key: string; result: PreviewResult<T> } | null>(() => (key && seed ? { key, result: { status: "ok", data: seed } } : null));
  React.useEffect(() => {
    if (!key || !load) return;
    let live = true;
    void load().then((result) => {
      if (live) setGot({ key, result });
    });
    return () => {
      live = false;
    };
    // The key and the generation name the request; `load` is rebuilt with them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, generation]);
  return got && got.key === key ? got.result : null;
}

/** A pairing's games shown before "Show all": the opened opponent stays a few lines tall, so the panel keeps within the screen. */
const GAMES_SHOWN = 3;
const plural = (n: number, word: string) => `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;
const record = (wins: number, games: number) => `${formatCount(wins)}W ${formatCount(games - wins)}L`;

export interface PreviewProps {
  playerId: string;
  isOwn: boolean;
  card: OverviewCard;
  /** The champion's rows in other roles, to switch to. */
  otherRoles: OverviewCard[];
  vs: string | null;
  champ: (id: string) => PortraitChampion;
  data: ReturnType<typeof usePreviewData>;
  onVs: (vs: string | null) => void;
  onSwitch: (card: OverviewCard) => void;
  titleId: string;
  onMatch: (matchId: string) => void;
}

/** One figure of the champion's record: its label, the figure, and what it is per (or "—" where no game carries it). */
function StatTile({ label, value, sub, testId }: { label: string; value: string; sub: string | null; testId: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-surface px-2.5 py-1.5" data-testid={testId}>
      <dt className="label-text truncate">{label}</dt>
      <dd className="text-base font-semibold leading-tight tabular-nums text-fg">{value}</dd>
      <dd className="truncate text-2xs tabular-nums text-fg-muted">{sub ?? " "}</dd>
    </div>
  );
}

/** The champion's averages in these filters, each over the games that carry it: the row's KDA and CS/min with what they come from, and the two the table has no column for. */
function StatTiles({ card }: { card: OverviewCard }) {
  const p = card.performance;
  const one = (v: number | null) => (v === null ? null : v.toFixed(1));
  const kda = [one(p.kills), one(p.deaths), one(p.assists)];
  return (
    <dl className="grid grid-cols-2 gap-1.5 @min-[26rem]/detail:grid-cols-4" data-testid="champion-preview-stats">
      <StatTile label="KDA" value={p.perfectKda ? "Perfect" : p.kdaRatio === null ? "—" : p.kdaRatio.toFixed(2)} sub={kda.every((x) => x !== null) ? kda.join(" / ") : null} testId="champion-stat-kda" />
      <StatTile label="CS/min" value={p.csPerMinute === null ? "—" : p.csPerMinute.toFixed(1)} sub={p.csPerGame === null ? null : `${formatCount(Math.round(p.csPerGame))} a game`} testId="champion-stat-cs" />
      <StatTile label="Damage/min" value={p.damagePerMinute === null ? "—" : formatCount(Math.round(p.damagePerMinute))} sub={p.damagePerGame === null ? null : `${formatKilo(Math.round(p.damagePerGame))} a game`} testId="champion-stat-damage" />
      <StatTile label="Vision" value={p.visionPerGame === null ? "—" : p.visionPerGame.toFixed(1)} sub={p.visionPerGame === null ? null : "a game"} testId="champion-stat-vision" />
    </dl>
  );
}

/**
 * The row's kill figures, which the docked panel lies over on a wide table (Kills, or Double,
 * Triple, Quadra and Penta): one line, each count with its word, "*" where only some of the games
 * are counted so far and "—" where none is (never a zero for unknown).
 */
function KillsLine({ card }: { card: OverviewCard }) {
  const p = card.performance;
  const m = card.multikills;
  const partial = (done: number, of: number) => (done < of ? "*" : "");
  const kills = p.totalKills === null ? "—" : `${formatCount(p.totalKills)}${partial(p.detailedGames, card.selected.games)}`;
  const multi = !m || !m.games ? null : !m.counted ? "not counted yet" : `${MULTIKILL_KINDS.map((k) => `${formatCount(m[k.key])} ${MULTIKILL_SHORT[k.key].toLowerCase()}`).join(" · ")}${partial(m.counted, m.games)}`;
  const some = (p.totalKills !== null && p.detailedGames < card.selected.games) || (!!m && m.counted > 0 && m.counted < m.games);
  return (
    <p className="text-xs tabular-nums text-fg-muted" data-testid="champion-preview-kills">
      <span>Kills</span> <span className="font-semibold text-fg">{kills}</span>
      {multi ? (
        <>
          {" · "}
          <span>Multikills</span> <span className="text-fg">{multi}</span>
        </>
      ) : null}
      {some ? <span className="sr-only"> (* from some of the games only: {m ? multikillCoverage(m).label.toLowerCase() : "the rest still loading"})</span> : null}
    </p>
  );
}

/*
  The opponents as one compact table: the opponent, its games, the record and the win rate (from 3
  games), a chevron; a heading row over them (hidden from screen readers: each cell says what it is
  to them). An opened opponent unfolds its games under its row, inside the same panel.
*/
const OPPONENT_GRID = "grid grid-cols-[minmax(0,1fr)_2.5rem_3.75rem_2.75rem_1rem] items-center gap-x-2";

/**
 * The preview's content, the same in the docked panel beside the list and in a phone's sheet (the
 * shared Peek, whose header names the champion and holds ‹ › and ✕): the portrait and role with the
 * record at the right, four tiles of averages, then the lane opponents as a compact table, an opened
 * opponent's games under its row, and the foot line.
 */
export function PreviewContent({ playerId, isOwn, card, otherRoles, vs, champ, data, onVs, onSwitch, titleId, onMatch }: PreviewProps) {
  const me = champ(card.championId);
  const r = card.selected;
  const p = card.performance;
  const key = `${data.scopeKey}|${card.championId}|${card.role}`;
  const seed = data.initial.preview && data.initial.preview.champion === card.championId && data.initial.preview.role === card.role ? data.initial.preview : null;
  const answer = useAnswer(key, data.generation, () => data.preview(card.championId, card.role), seed);
  const preview = answer?.status === "ok" ? answer.data : null;
  const [sort, setSort] = React.useState<OpponentSort>("games");
  const [more, setMore] = React.useState(false);
  // The first OPPONENTS_SHOWN opponents with 3+ games in the chosen order; the rest one click away, so a champion with thirty opponents keeps the panel within the screen.
  const [allListed, setAllListed] = React.useState(false);
  const arranged = React.useMemo(() => arrangeOpponents(preview?.opponents ?? [], sort), [preview, sort]);
  const tone = WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)];
  const rows = (list: OpponentTally[], withRate: boolean) =>
    list.map((o) => <OpponentRow key={o.championId} o={o} withRate={withRate} open={vs === o.championId} me={me} champ={champ} card={card} isOwn={isOwn} data={data} onToggle={() => onVs(vs === o.championId ? null : o.championId)} onMatch={onMatch} playerId={playerId} />);
  const roleLine = `${ROLE_LABELS[card.role]}${card.inPool ? " · In pool" : ""}`;
  const partial = p.detailedGames < r.games;
  return (
    <div id="champion-preview" className="@container/detail flex flex-col gap-3" data-testid="champion-preview-content" data-champion={card.championId} data-role={card.role}>
      {/* Who and how it went: the portrait and the role (the panel's heading names the champion), the record at the right. */}
      <header className="flex items-start gap-3">
        <ChampionPortrait champion={me} size="md" className="shrink-0 rounded-lg ring-1 ring-border-strong/60" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight text-fg" data-testid="champion-preview-role-line">
            {roleLine}
          </p>
          {otherRoles.length ? (
            <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-muted">
              {otherRoles.map((o) => (
                <button key={o.role} type="button" onClick={() => onSwitch(o)} className="text-left underline decoration-fg-subtle/50 underline-offset-2 hover:text-fg pointer-coarse:min-h-11" data-testid="champion-preview-role">
                  Also as {ROLE_LABELS[o.role]}: {plural(o.selected.games, "game")} · {record(o.selected.wins, o.selected.games)}
                </button>
              ))}
            </p>
          ) : null}
        </div>
        <div className="shrink-0 text-right" data-testid="champion-preview-figures">
          <p className="flex items-baseline justify-end gap-1.5">
            <span className={cn("text-2xl font-bold tabular-nums leading-none", tone)} data-testid="champion-preview-winrate">
              {r.winRate === null ? "—" : percent(r.winRate, 0)}
            </span>
            <span className="text-xs text-fg-muted">win rate</span>
          </p>
          <p className="mt-1 text-xs text-fg-muted" data-testid="champion-preview-record-line">
            <span className="font-semibold tabular-nums text-fg">{formatCount(r.games)}</span> game{r.games === 1 ? "" : "s"} · {record(r.wins, r.games)}
          </p>
        </div>
      </header>
      <section aria-label={`${me.name}'s record`} className="flex flex-col gap-1.5" data-testid="champion-preview-record">
        <StatTiles card={card} />
        <KillsLine card={card} />
        <p className="text-xs text-fg-subtle" data-testid="champion-preview-coverage">
          {partial ? `Averages from the ${plural(p.detailedGames, "game")} with a full record, of ${formatCount(r.games)}.` : `Averages over ${r.games === 1 ? "the one game" : `all ${formatCount(r.games)} games`} in these filters.`}
          {card.mastery?.points ? ` ${formatCompactCount(card.mastery.points)} mastery points.` : ""}
        </p>
      </section>
      <section aria-labelledby={`${titleId}-opponents`} className="flex flex-col gap-1.5" data-testid="champion-preview-opponents">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${titleId}-opponents`} className="text-sm font-semibold text-fg">
            Against each lane opponent
          </h3>
          {arranged.listed.length > 1 && !arranged.noneEstablished ? (
            <div role="group" aria-label="Sort the opponents" className={segmentedGroupClass("flex-wrap overflow-visible")}>
              {OPPONENT_SORTS.map((s) => (
                <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)} className={segmentClass(sort === s.key, { size: "sm", className: "pointer-coarse:min-w-11" })} data-testid={`opponent-sort-${s.key}`}>
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {!preview ? (
          answer?.status === "not-found" ? (
            <p className="text-sm text-fg-muted">{answer.message}</p>
          ) : (
            <div className="flex flex-col gap-1" aria-hidden data-testid="champion-preview-loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 animate-pulse rounded-md bg-surface-2/70" />
              ))}
            </div>
          )
        ) : !preview.opponents.length ? (
          <p className="text-sm text-fg-muted" data-testid="champion-preview-no-opponents">
            No lane opponent is known in these games yet.
          </p>
        ) : (
          <div>
            {arranged.noneEstablished ? <p className="mb-1 text-xs text-fg-subtle" data-testid="champion-preview-none-established">No opponent met {OPPONENT_MIN_GAMES} times yet.</p> : null}
            <div className={cn(OPPONENT_GRID, "label-text border-b border-border/60 pb-1 pl-0.5")} aria-hidden data-testid="champion-preview-opponent-head">
              <span>Opponent</span>
              <span className="text-right">Games</span>
              <span className="text-right">Record</span>
              <span className="text-right">Win</span>
              <span />
            </div>
            <ul className="flex flex-col divide-y divide-border/50" data-testid="champion-preview-opponent-list">
              {rows(allListed ? arranged.listed : arranged.listed.slice(0, OPPONENTS_SHOWN), !arranged.noneEstablished)}
            </ul>
            {arranged.listed.length > OPPONENTS_SHOWN ? (
              <button type="button" aria-expanded={allListed} onClick={() => setAllListed((a) => !a)} className="flex min-h-9 w-full items-center gap-1.5 border-t border-border/50 text-left text-xs text-fg-muted hover:text-fg pointer-coarse:min-h-11" data-testid="champion-preview-more-listed">
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", allListed && "rotate-180")} aria-hidden />
                {allListed ? `The first ${formatCount(OPPONENTS_SHOWN)} only` : `${formatCount(arranged.listed.length - OPPONENTS_SHOWN)} more opponent${arranged.listed.length - OPPONENTS_SHOWN === 1 ? "" : "s"} with ${OPPONENT_MIN_GAMES}+ games`}
              </button>
            ) : null}
            {arranged.folded.length ? (
              <>
                <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex min-h-9 w-full items-center gap-1.5 border-t border-border/50 text-left text-xs text-fg-muted hover:text-fg pointer-coarse:min-h-11" data-testid="champion-preview-more">
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", more && "rotate-180")} aria-hidden />
                  {formatCount(arranged.folded.length)} more opponent{arranged.folded.length === 1 ? "" : "s"} with 1–2 games
                </button>
                {more ? <ul className="flex flex-col divide-y divide-border/50 border-t border-border/50">{rows(arranged.folded, false)}</ul> : null}
              </>
            ) : null}
          </div>
        )}
      </section>
      {preview ? (
        <p className="border-t border-border/60 pt-2.5 text-xs text-fg-subtle" data-testid="champion-preview-foot">
          {opponentFootLine({ isOwn, known: preview.known, games: preview.games })}
        </p>
      ) : null}
    </div>
  );
}

function OpponentRow({ o, withRate, open, me, champ, card, isOwn, data, onToggle, onMatch, playerId }: { o: OpponentTally; withRate: boolean; open: boolean; me: PortraitChampion; champ: (id: string) => PortraitChampion; card: OverviewCard; isOwn: boolean; data: ReturnType<typeof usePreviewData>; onToggle: () => void; onMatch: (matchId: string) => void; playerId: string }) {
  const them = champ(o.championId);
  const rate = o.wins / o.games;
  const toned = o.games >= OPPONENT_TONED_GAMES;
  const panelId = `opponent-${playerId.slice(0, 8)}-${o.championId}`;
  return (
    <li data-testid="champion-preview-opponent" data-champion={o.championId} data-games={o.games}>
      <button type="button" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={onToggle} className={cn(OPPONENT_GRID, "min-h-9 w-full rounded-sm py-1 pl-0.5 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-11", open && "bg-surface-2/60")}>
        <span className="flex min-w-0 items-center gap-2">
          <ChampionPortrait champion={them} size="xs" className="shrink-0 rounded" />
          <span className="min-w-0 truncate text-sm font-medium text-fg">{them.name}</span>
        </span>
        <span className="text-right text-sm tabular-nums text-fg" data-testid="opponent-games">
          {formatCount(o.games)}
          <span className="sr-only"> game{o.games === 1 ? "" : "s"}</span>
        </span>
        <span className="text-right text-xs tabular-nums text-fg-muted">{record(o.wins, o.games)}</span>
        {/* Under OPPONENT_TONED_GAMES the rate is a small sample: the tertiary grey, with the words for screen readers. */}
        <span className={cn("text-right text-sm font-semibold tabular-nums", toned ? WIN_RATE_TONE_CLASS[winRateTone(rate, o.games, OPPONENT_TONED_GAMES)] : "text-fg-subtle")}>
          {withRate ? (
            <>
              {percent(rate, 0)}
              {toned ? null : <span className="sr-only"> (small sample)</span>}
            </>
          ) : null}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <PairingGames id={panelId} me={me} them={them} card={card} isOwn={isOwn} data={data} onMatch={onMatch} /> : null}
    </li>
  );
}

function PairingGames({ id, me, them, card, isOwn, data, onMatch }: { id: string; me: PortraitChampion; them: PortraitChampion; card: OverviewCard; isOwn: boolean; data: ReturnType<typeof usePreviewData>; onMatch: (matchId: string) => void }) {
  const key = `${data.scopeKey}|${card.championId}|${card.role}|${them.id}`;
  const init = data.initial.pairing;
  const seed = init && init.champion === card.championId && init.role === card.role && init.vs === them.id ? init : null;
  const answer = useAnswer(key, data.generation, () => data.pairing(card.championId, card.role, them.id), seed);
  const pairing = answer?.status === "ok" ? answer.data : null;
  const [all, setAll] = React.useState(false);
  const sentence = pairing ? opponentSentence(pairing.ten, { isOwn, champion: me.name, opponent: them.name }) : null;
  const kda = pairing ? pairingKda(pairing.games) : null;
  return (
    <div id={id} className="mb-1.5 flex flex-col gap-1.5 rounded-md bg-surface-2/40 px-2 py-1.5" data-testid="champion-preview-pairing">
      {kda && pairing ? (
        <p className="text-xs tabular-nums text-fg-muted" data-testid="champion-preview-pairing-kda">
          <span className="font-semibold text-fg">{kda.perfect ? "Perfect KDA" : `KDA ${kda.ratio.toFixed(2)}`}</span> · {kda.kills.toFixed(1)} / {kda.deaths.toFixed(1)} / {kda.assists.toFixed(1)} {kda.games === pairing.games.length ? (kda.games === 1 ? "in this game" : `over these ${formatCount(kda.games)} games`) : `over the ${plural(kda.games, "game")} with a full record`}
        </p>
      ) : null}
      {sentence ? <p className="text-xs text-fg-muted" data-testid="champion-preview-sentence">{sentence}</p> : null}
      {!pairing ? (
        <div className="h-8 animate-pulse rounded bg-surface-2/70" aria-hidden />
      ) : (
        <ul className="flex flex-col" data-testid="champion-preview-games">
          {(all ? pairing.games : pairing.games.slice(0, GAMES_SHOWN)).map((g) => (
            <li key={g.matchId}>
              <button type="button" onClick={() => onMatch(g.matchId)} className="grid min-h-7 w-full grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-2 rounded px-1 text-left pointer-coarse:min-h-11 text-xs tabular-nums hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent" data-testid="champion-preview-game">
                <span className={cn("font-semibold", g.win ? "text-good" : "text-bad")}>{g.win ? "W" : "L"}</span>
                <span className="truncate text-fg">
                  {g.kills === null ? "—" : `${g.kills}/${g.deaths ?? 0}/${g.assists ?? 0}`}
                  {g.cs === null ? "" : ` · ${formatCount(g.cs)} CS`}
                </span>
                <span className="text-fg-muted">{g.gold10 === null ? (g.timeline === "frames" ? "—" : "no timeline") : `${g.gold10 > 0 ? "+" : g.gold10 < 0 ? "−" : "±"}${formatCount(Math.abs(Math.round(g.gold10)))} at 10:00`}</span>
                <span className="text-fg-subtle">{formatDate(g.playedAt)}</span>
              </button>
            </li>
          ))}
          {!all && pairing.games.length > GAMES_SHOWN ? (
            <li>
              <button type="button" onClick={() => setAll(true)} className="min-h-8 px-1 text-xs font-medium text-accent hover:underline pointer-coarse:min-h-11" data-testid="champion-preview-all-games">
                Show all {formatCount(pairing.games.length)} games
              </button>
            </li>
          ) : null}
        </ul>
      )}
      <Link href={lookupHref(them.id)} prefetch={false} className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-accent hover:underline pointer-coarse:min-h-11" data-testid="champion-preview-lookup">
        <ScanSearch className="h-3.5 w-3.5" aria-hidden />
        {them.name}&apos;s abilities in Champion Intel →
      </Link>
    </div>
  );
}
