"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Swords, X } from "lucide-react";
import type { OverviewCard } from "@/server/players/overview";
import type { ChampionPreviewData, PairingGamesData, PreviewScope } from "@/server/players/champion-preview";
import type { PreviewResult } from "@/server/actions/champion-preview";
import { getChampionPreviewAction, getPairingGamesAction } from "@/server/actions/champion-preview";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { isGameRole } from "@/domain/season-stats";
import { OPPONENT_MIN_GAMES, OPPONENT_SORTS, OPPONENT_TONED_GAMES, arrangeOpponents, opponentFootLine, opponentSentence, type OpponentSort, type OpponentTally } from "@/domain/champion-preview";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { matchupHref } from "@/components/matchup-intel/address";
import { formatCompactCount, formatCount, formatDate, percent } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  All Champions' preview (PLAN S5, CM §4): one champion in one role, and the player's record against
  each lane opponent. On a wide list it unfolds inside the list's card, over the columns after Win
  rate (the list never moves); with too little room, and on phones and tablets, it is a sheet.

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

/** A pairing's games shown before "Show all": the preview stays about one screen tall. */
const GAMES_SHOWN = 5;
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
  onClose: () => void;
  /** In the shared Peek, whose header has the name, ‹ › and ✕: the content leads with the portrait and role only. */
  compact?: boolean;
  titleId: string;
  onMatch: (matchId: string) => void;
}

/** The preview's content: the same in the page and in the sheet. */
export function PreviewContent({ playerId, isOwn, card, otherRoles, vs, champ, data, onVs, onSwitch, onClose, compact, titleId, onMatch }: PreviewProps) {
  const me = champ(card.championId);
  const r = card.selected;
  const p = card.performance;
  const key = `${data.scopeKey}|${card.championId}|${card.role}`;
  const seed = data.initial.preview && data.initial.preview.champion === card.championId && data.initial.preview.role === card.role ? data.initial.preview : null;
  const answer = useAnswer(key, data.generation, () => data.preview(card.championId, card.role), seed);
  const preview = answer?.status === "ok" ? answer.data : null;
  const [sort, setSort] = React.useState<OpponentSort>("games");
  const [more, setMore] = React.useState(false);
  const arranged = React.useMemo(() => arrangeOpponents(preview?.opponents ?? [], sort), [preview, sort]);
  const figures = [
    p.perfectKda ? "Perfect KDA" : p.kdaRatio === null ? null : `KDA ${p.kdaRatio.toFixed(2)}`,
    p.csPerMinute === null ? null : `${p.csPerMinute.toFixed(1)} CS/min`,
    card.mastery?.points ? `${formatCompactCount(card.mastery.points)} mastery` : null,
  ].filter(Boolean);
  const tone = WIN_RATE_TONE_CLASS[winRateTone(r.winRate, r.games, WIN_RATE_MIN_GAMES.champion)];
  const rows = (list: OpponentTally[], withRate: boolean) =>
    list.map((o) => <OpponentRow key={o.championId} o={o} withRate={withRate} open={vs === o.championId} me={me} champ={champ} card={card} isOwn={isOwn} data={data} onToggle={() => onVs(vs === o.championId ? null : o.championId)} onMatch={onMatch} playerId={playerId} />);
  return (
    <div className="flex flex-col gap-4" data-testid="champion-preview-content" data-champion={card.championId} data-role={card.role}>
      {compact ? (
        <div className="flex items-center gap-3">
          <ChampionPortrait champion={me} size="lg" className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-border-strong/60" />
          <p className="text-sm text-fg-subtle">
            {ROLE_LABELS[card.role]}
            {card.inPool ? " · In pool" : ""}
          </p>
        </div>
      ) : (
        <header className="flex items-start gap-3">
          <ChampionPortrait champion={me} size="lg" className="h-14 w-14 shrink-0 rounded-lg ring-1 ring-border-strong/60" />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} tabIndex={-1} className="truncate text-xl font-bold leading-tight text-fg outline-none" data-testid="champion-preview-title">
              {me.name}
            </h2>
            <p className="mt-0.5 text-sm text-fg-subtle">
              {ROLE_LABELS[card.role]}
              {card.inPool ? " · In pool" : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent" aria-label="Close the preview" data-testid="champion-preview-close">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
      )}
      {otherRoles.length ? (
        <p className="-mt-2 flex flex-wrap gap-x-3 text-xs text-fg-subtle">
          {otherRoles.map((o) => (
            <button key={o.role} type="button" onClick={() => onSwitch(o)} className="underline decoration-fg-subtle/50 underline-offset-2 hover:text-fg" data-testid="champion-preview-role">
              Also as {ROLE_LABELS[o.role]}: {plural(o.selected.games, "game")} · {record(o.selected.wins, o.selected.games)}
            </button>
          ))}
        </p>
      ) : null}
      <div className="flex items-end justify-between gap-3" data-testid="champion-preview-figures">
        <p className="flex items-baseline gap-1.5">
          <span className={cn("text-4xl font-bold tabular-nums leading-none", tone)}>{r.winRate === null ? "—" : percent(r.winRate, 0)}</span>
          <span className="text-sm text-fg-muted">win rate</span>
        </p>
        <p className="text-right text-sm text-fg-muted">
          <span className="font-semibold tabular-nums text-fg">{formatCount(r.games)}</span> game{r.games === 1 ? "" : "s"} · {record(r.wins, r.games)}
        </p>
      </div>
      {figures.length ? <p className="-mt-2 text-xs text-fg-subtle">{figures.join(" · ")}</p> : null}
      <section aria-labelledby={`${titleId}-opponents`} className="flex flex-col gap-2" data-testid="champion-preview-opponents">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${titleId}-opponents`} className="text-sm font-semibold text-fg">
            Against each lane opponent
          </h3>
          {arranged.listed.length > 1 && !arranged.noneEstablished ? (
            <div role="group" aria-label="Sort the opponents" className="inline-flex rounded-md border border-border bg-bg-elevated p-0.5 text-xs">
              {OPPONENT_SORTS.map((s) => (
                <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)} className={cn("rounded px-2 py-1 font-medium transition-colors", sort === s.key ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg")} data-testid={`opponent-sort-${s.key}`}>
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
            <div className="flex flex-col gap-1.5" aria-hidden data-testid="champion-preview-loading">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-surface-2/70" />
              ))}
            </div>
          )
        ) : !preview.opponents.length ? (
          <p className="text-sm text-fg-muted" data-testid="champion-preview-no-opponents">
            No lane opponent is known in these games yet.
          </p>
        ) : (
          <>
            {arranged.noneEstablished ? <p className="text-xs text-fg-subtle" data-testid="champion-preview-none-established">No opponent met {OPPONENT_MIN_GAMES} times yet.</p> : null}
            <ul className="flex flex-col divide-y divide-border/60" data-testid="champion-preview-opponent-list">
              {rows(arranged.listed, !arranged.noneEstablished)}
            </ul>
            {arranged.folded.length ? (
              <div>
                <button type="button" aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex min-h-9 w-full items-center gap-1.5 text-left text-xs text-fg-muted hover:text-fg" data-testid="champion-preview-more">
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", more && "rotate-180")} aria-hidden />
                  {formatCount(arranged.folded.length)} more opponent{arranged.folded.length === 1 ? "" : "s"} with 1–2 games
                </button>
                {more ? <ul className="flex flex-col divide-y divide-border/60">{rows(arranged.folded, false)}</ul> : null}
              </div>
            ) : null}
          </>
        )}
      </section>
      {preview ? (
        <p className="border-t border-border/60 pt-3 text-xs text-fg-subtle" data-testid="champion-preview-foot">
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
      <button type="button" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={onToggle} className="flex min-h-[2.875rem] w-full items-center gap-2.5 py-1.5 text-left transition-colors hover:bg-surface-2/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
        <ChampionPortrait champion={them} size="sm" className="h-7 w-7 shrink-0 rounded-md" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{them.name}</span>
        <span className="text-xs tabular-nums text-fg-subtle">{record(o.wins, o.games)}</span>
        {withRate ? (
          <span className={cn("w-11 text-right text-sm font-semibold tabular-nums", toned ? WIN_RATE_TONE_CLASS[winRateTone(rate, o.games, OPPONENT_TONED_GAMES)] : "text-fg-muted")}>
            {percent(rate, 0)}
            {toned ? null : <span className="sr-only"> (small sample)</span>}
          </span>
        ) : null}
        <span className="w-16 text-right text-xs tabular-nums text-fg-muted">{plural(o.games, "game")}</span>
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
  return (
    <div id={id} className="mb-2 flex flex-col gap-2 rounded-md bg-surface-2/40 px-2.5 py-2" data-testid="champion-preview-pairing">
      {sentence ? <p className="text-xs text-fg-muted" data-testid="champion-preview-sentence">{sentence}</p> : null}
      {!pairing ? (
        <div className="h-8 animate-pulse rounded bg-surface-2/70" aria-hidden />
      ) : (
        <ul className="flex flex-col" data-testid="champion-preview-games">
          {(all ? pairing.games : pairing.games.slice(0, GAMES_SHOWN)).map((g) => (
            <li key={g.matchId}>
              <button type="button" onClick={() => onMatch(g.matchId)} className="grid min-h-8 w-full grid-cols-[1.5rem_minmax(0,1fr)_auto_auto] items-center gap-2 rounded px-1 text-left text-xs tabular-nums hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent" data-testid="champion-preview-game">
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
              <button type="button" onClick={() => setAll(true)} className="min-h-8 px-1 text-xs font-medium text-accent hover:underline" data-testid="champion-preview-all-games">
                Show all {formatCount(pairing.games.length)} games
              </button>
            </li>
          ) : null}
        </ul>
      )}
      <Link href={matchupHref(me.id, them.id)} prefetch={false} className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-accent hover:underline" data-testid="champion-preview-intel">
        <Swords className="h-3.5 w-3.5" aria-hidden />
        Prepare {me.name} vs {them.name} in Matchup Intel →
      </Link>
    </div>
  );
}
