"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Columns2, LayoutGrid } from "lucide-react";
import type { ChampionChoice } from "@/domain/champion-lookup/types";
import type { LookupChampion } from "@/domain/champion-lookup/view";
import { columnStats, rankColumns } from "@/domain/champion-lookup/board";
import { clampHaste } from "@/domain/champion-lookup/haste";
import { SLOTS } from "@/domain/champion-lookup/types";
import { DEFAULT_BUILD_QUEUE, type BuildQueueKey, type BuildSource } from "@/domain/champion-builds";
import { ROLES, type Role } from "@/domain/roles";
import { AGAINST_LABEL, NO_LANE, PLAYING_LABEL, laneControlLabel } from "@/domain/matchup/words";
import { ChampionPortrait } from "@/components/champion-portrait";
import { toolbarButtonClass } from "@/components/ui/filter-bar";
import { PAGE_TITLE } from "@/components/ui/page-header";
import { RoleSegmented } from "@/components/ui/segmented";
import { intelHref, swappedHref, withoutHref } from "./address";
import { SlotKey } from "./ability-list";
import type { StatLine } from "./base-stats";
import { BuildsChoiceProvider } from "./builds-choice";
import { ChampionPanel } from "./champion-panel";
import { ChampionPickerWindow } from "./champion-picker";
import { ChampionSearch } from "./champion-search";
import { MatchupBandLoading } from "./matchup-band-loading";
import { PageQueueProvider } from "./page-queue";
import { useRecentLookups } from "./recent";
import { cn } from "@/lib/cn";

/*
  CHAMPION INTEL's page in the browser (docs/CHAMPION_INTEL.md): the title with where the numbers
  come from and, at its right, Compare (one champion) or Swap (two); then the board: one champion,
  or two side by side as one aligned board.

  The address carries both champions, both hastes, the role each builds section shows where one
  was chosen, and the builds' queue and source, the page's, left out for Ranked Solo/Duo and the
  team's matches (/lookup?champion=Ahri&haste=20&champion2=Jinx&haste2=0&role2=ADC&queue=flex), so a
  reload or a shared link opens the same; they are the page's state, like a filter, so a change replaces the address and never adds a
  history entry (Back leaves the page in one step). A champion chosen (from its name, which opens the
  window of every champion, or Compare) is built on the server: until it arrives, its column says
  what is loading and is out of reach. A haste, and a builds section's role, queue and source, change
  the page here at once, with no request (every queue's counts came with the page).
  Swap and ✕ show their result at once too, while the address catches up; while any change is on
  its way they wait (aria-disabled, so the focus stays on them), and a champion chosen for the other
  column meanwhile keeps the one still loading. What is typed or chosen here while the page's own
  change is on its way (a haste, a role) stays when it arrives. "/" opens the window for the
  champion whose column holds the focus (else the first).

  Compare (the owner's request of 25 Nov 2026) is one board: a narrow column of the slots' keys,
  then each champion's column, a subgrid of the board's ten rows (header, facts, the abilities'
  heading, P, Q, W, E, R, the builds' twelve rows, base statistics), so every row of the two
  champions lines up, side by side from a 390px phone up; only where the board is under 22rem (a
  phone of 375px or less, or a large text size) the two columns stack, so no name breaks inside a
  word. Two neutral references: no colour or word says which value is better, no difference is
  computed.

  Matchup Intel (the owner's request of 26 Nov 2026, item 4; docs/MATCHUP_INTEL.md) is Compare with a
  lane: the Lane control beside Swap (lane=TOP… in the address, written only with two champions)
  puts the early-lane band (`matchup`, rendered by the page) between the title and the board, the
  first column the champion played ("Playing") and the second its lane opponent ("Against"). A lane
  needs the server (its evidence and notes), so it is chosen like a champion: Swap and ✕ wait while
  it is on its way, and the band's skeleton shows at once. Swap keeps the lane and shows the other
  side; ✕ drops it; a champion changed keeps it. Only there does the page state differences, in
  neutral words, and the rank-1 cell of every ability row is tinted (the levels of a lane's start).
  The page's queue (queue=flex…, Ranked Solo/Duo left out) is client state like a haste: every
  queue's figures came with the page.
*/

type Which = 0 | 1;

const subscribeNothing = () => () => undefined;

/** Two keys for the two columns, the champion's own id, so a column's folds travel with its champion on a swap (the same champion twice: the second gets its own). */
function columnKeys(a: string | null, b: string | null): [string, string] {
  const first = a ?? "none";
  const second = b ?? "none";
  return [first, second === first ? `${second}~2` : second];
}

/** Compare's narrow first column: each ability row's slot key, level with both champions' rows (drawn; each row's heading names its slot). */
function KeyColumn({ builds }: { builds: boolean }) {
  return (
    <div aria-hidden className="col-start-1 row-span-full hidden grid-rows-subgrid @min-[22rem]/board:grid" data-testid="lookup-key-column">
      <span className="row-start-2 border-b border-border" />
      <span className="row-start-3 border-b border-border" />
      {SLOTS.map((slot, i) => (
        <span key={slot} className="flex justify-center border-b border-border pt-2 @min-[59.25rem]/board:pt-3" style={{ gridRowStart: 4 + i }}>
          <SlotKey slot={slot} />
        </span>
      ))}
      {builds ? <span className="row-start-9 row-span-12 border-b border-border" /> : null}
    </div>
  );
}

export function LookupView({
  champions,
  lookup,
  second,
  initialHaste,
  initialHaste2,
  initialRoles,
  initialQueue = DEFAULT_BUILD_QUEUE,
  initialSource = "team",
  source,
  dropped,
  builds,
  initialLane = null,
  matchup,
}: {
  champions: ChampionChoice[];
  lookup: LookupChampion | null;
  second: LookupChampion | null;
  initialHaste: number;
  initialHaste2: number;
  /** The role each champion's builds section shows, from the address (role, role2); null for its default. */
  initialRoles?: [Role | null, Role | null];
  /** The page's queue from the address (queue=): the builds' (both columns read it) and Matchup Intel's band's; Ranked Solo/Duo by default. */
  initialQueue?: BuildQueueKey;
  /** The builds' source, the page's: "master" only where the server offers it. */
  initialSource?: BuildSource;
  /** The source line beside the title (Riot Data Dragon's version, its patch, the game's patch). */
  source: React.ReactNode;
  dropped: boolean;
  /**
   * The builds section of each champion the address names, rendered by the page (the slot of
   * docs/CHAMPION_INTEL.md, "Builds slot"): `first` for `champion`, `second` for `champion2`. Each
   * goes with its champion (above the statistics on one champion's board, its own row after R in
   * Compare); nothing is drawn where none is given.
   */
  builds?: { first?: React.ReactNode; second?: React.ReactNode };
  /** Matchup Intel's lane from the address (lane=), with two champions only; null for none. */
  initialLane?: Role | null;
  /** Matchup Intel's band for the two champions and the lane, rendered by the page; nothing without a lane. */
  matchup?: React.ReactNode;
}) {
  const router = useRouter();
  // False on the server and while the page hydrates, then true: the page says when its controls answer.
  const ready = React.useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [pending, startTransition] = React.useTransition();
  // The champion each column is loading (chosen from its name or Compare), while a change is on its way.
  const [targets, setTargets] = React.useState<Partial<Record<Which, ChampionChoice>>>({});
  const [hastes, setHastes] = React.useState<[number, number]>([clampHaste(initialHaste), clampHaste(initialHaste2)]);
  // Each builds section's role (the page's state, like the hastes).
  const [roleA, roleB] = initialRoles ?? [null, null];
  const [roles, setRoles] = React.useState<[Role | null, Role | null]>([roleA, roleB]);
  // The page's queue (the builds' and Matchup Intel's band alike), the builds' source (both columns
  // alike: Compare reads one population) and Matchup Intel's lane (Compare only): the page's state, like the hastes.
  const [queue, setQueue] = React.useState<BuildQueueKey>(initialQueue);
  const [buildsSource, setBuildsSource] = React.useState<BuildSource>(initialSource);
  const [lane, setLane] = React.useState<Role | null>(second ? initialLane : null);
  const page = { lane, queue, source: buildsSource };
  // The page as the server sent it: champions, hastes and roles. When it changes, an address opened
  // from elsewhere (a link, the browser's own navigation) brings its own hastes and roles; the
  // address this page itself sent (`sent`: Swap, ✕, a champion chosen) keeps what was typed or chosen
  // here while it was on its way (a haste typed during a swap is not undone when the swap arrives).
  const arrived = `${lookup?.champion.id ?? ""}|${second?.champion.id ?? ""}|${initialHaste}|${initialHaste2}|${roleA ?? ""}|${roleB ?? ""}|${second ? (initialLane ?? "") : ""}|${initialQueue}|${initialSource}`;
  const [seen, setSeen] = React.useState(arrived);
  const [sent, setSent] = React.useState<string | null>(null);
  if (seen !== arrived) {
    setSeen(arrived);
    if (sent !== arrived) {
      setHastes([clampHaste(initialHaste), clampHaste(initialHaste2)]);
      setRoles([roleA, roleB]);
      setLane(second ? initialLane : null);
      setQueue(initialQueue);
      setBuildsSource(initialSource);
    }
    setSent(null);
  }
  /** The page this page's own change will arrive as (the key `arrived` will have). */
  const sentKey = (a: string | null, b: string | null, h: readonly [number, number], r: readonly [Role | null, Role | null], l: Role | null = lane, q: BuildQueueKey = queue) => `${a ?? ""}|${b ?? ""}|${h[0]}|${b ? h[1] : 0}|${r[0] ?? ""}|${b ? (r[1] ?? "") : ""}|${b ? (l ?? "") : ""}|${q}|${buildsSource}`;
  const [picking, setPicking] = React.useState<Which | null>(null);
  // Compare's two statistics folds, open or closed together.
  const [statsOpen, setStatsOpen] = React.useState(false);
  const { recent, remember } = useRecentLookups();
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);

  // Swap and ✕ show their result at once, while the address catches up: each holds the page's
  // champions as they were when it was pressed, and stops applying once the page has new ones.
  const propsKey = `${lookup?.champion.id ?? ""}|${second?.champion.id ?? ""}|${initialHaste}|${initialHaste2}`;
  // ✕ keeps the champion that stays as its place among the page's own (`keep`: 0 for `lookup`, 1
  // for `second`), taken from the order shown when it was pressed, swapped or not.
  const [removed, setRemoved] = React.useState<{ keep: Which; key: string } | null>(null);
  const [swapped, setSwapped] = React.useState<string | null>(null);
  const keeping = removed && removed.key === propsKey ? removed.keep : null;
  const swapping = swapped === propsKey && pending;
  const base: Array<{ look: LookupChampion | null; builds: React.ReactNode }> = [
    { look: lookup, builds: builds?.first ?? null },
    { look: second, builds: builds?.second ?? null },
  ];
  const order: Array<{ look: LookupChampion | null; builds: React.ReactNode }> = keeping !== null ? [base[keeping]!, { look: null, builds: null }] : swapping ? [base[1]!, base[0]!] : base;
  const first = order[0]!.look?.champion.id ?? null;
  const secondId = order[1]!.look?.champion.id ?? null;
  // The champion each column will show: the one it is loading, else its own.
  const loadingOf = (which: Which) => (pending ? (targets[which] ?? null) : null);
  const meant: [string | null, string | null] = [loadingOf(0)?.id ?? first, loadingOf(1)?.id ?? secondId];
  const openerRef = React.useRef<HTMLElement | null>(null);
  // A column is out of reach (inert) while its champion loads, and the whole page while the window is
  // open: the focus goes to the chosen champion's name once it has arrived and the window has closed
  // (after the window's own hand-back, a frame later).
  const focusAfter = React.useRef<Which | null>(null);
  React.useEffect(() => {
    if (pending || picking !== null || focusAfter.current === null) return;
    const which = focusAfter.current;
    focusAfter.current = null;
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-panel="${which + 1}"] [data-testid="lookup-change"]`)?.focus({ preventScroll: true })));
    return () => window.cancelAnimationFrame(frame);
  }, [pending, picking]);

  /**
   * Builds the champion chosen for a column on the server; false when nothing changes (the champion
   * the column already shows or is loading, or none known). The other column keeps the champion it
   * shows, or the one it is still loading.
   */
  const go = (which: Which, id: string): boolean => {
    const c = byId.get(id);
    if (!c || id === meant[which]) return false;
    setRemoved(null);
    setSwapped(null);
    setTargets((now) => (pending ? { ...now, [which]: c } : { [which]: c }));
    const nextHastes: [number, number] = which === 1 && !meant[1] ? [hastes[0], 0] : hastes;
    if (which === 1 && !meant[1]) setHastes(nextHastes);
    // A new champion's builds open on their own default role.
    const nextRoles: [Role | null, Role | null] = which === 0 ? [null, roles[1]] : [roles[0], null];
    setRoles(nextRoles);
    const a = which === 0 ? id : meant[0];
    const b = which === 1 ? id : meant[1];
    // A champion changed keeps the lane (Matchup Intel stays on that lane); a first Compare has none yet.
    const nextLane = b ? lane : null;
    setSent(sentKey(a, b, nextHastes, nextRoles, nextLane));
    startTransition(() => router.replace(intelHref({ id: a, haste: nextHastes[0], role: nextRoles[0] }, b ? { id: b, haste: nextHastes[1], role: nextRoles[1] } : null, { ...page, lane: nextLane }), { scroll: false }));
    return true;
  };

  /** ✕ on either column: the other stays, as the first, with its own haste. Waits while a change is on its way. */
  const remove = (which: Which) => {
    if (pending || !first || !secondId) return;
    const stays = which === 0 ? hastes[1] : hastes[0];
    const href = withoutHref({ id: first, haste: hastes[0], role: roles[0] }, { id: secondId, haste: hastes[1], role: roles[1] }, which, page);
    const nextRoles: [Role | null, Role | null] = [which === 0 ? roles[1] : roles[0], null];
    // The column shown second is `lookup` when the two are shown swapped.
    setRemoved({ keep: swapping ? which : which === 0 ? 1 : 0, key: propsKey });
    setSwapped(null);
    setTargets({});
    setHastes([stays, 0]);
    setRoles(nextRoles);
    // The lane goes with Compare.
    setLane(null);
    setSent(sentKey(which === 0 ? secondId : first, null, [stays, 0], nextRoles, null));
    // The focus goes to the champion that stays, once the address has caught up.
    focusAfter.current = 0;
    startTransition(() => router.replace(href, { scroll: false }));
  };

  /** Swap: the two champions change places, each with its own haste and its open folds. Waits while a change is on its way. */
  const swap = () => {
    if (pending || !first || !secondId) return;
    const href = swappedHref({ id: first, haste: hastes[0], role: roles[0] }, { id: secondId, haste: hastes[1], role: roles[1] }, page);
    setSwapped(propsKey);
    setRemoved(null);
    setTargets({});
    setHastes([hastes[1], hastes[0]]);
    setRoles([roles[1], roles[0]]);
    setSent(sentKey(secondId, first, [hastes[1], hastes[0]], [roles[1], roles[0]]));
    startTransition(() => router.replace(href, { scroll: false }));
  };

  /** Matchup Intel's lane chosen (or none): the band is built on the server, so it goes as a champion does. Waits while a change is on its way. */
  const chooseLane = (next: Role | null) => {
    if (pending || !first || !secondId || next === lane) return;
    setLane(next);
    setSwapped(null);
    setRemoved(null);
    setTargets({});
    setSent(sentKey(first, secondId, hastes, roles, next));
    startTransition(() => router.replace(intelHref({ id: first, haste: hastes[0], role: roles[0] }, { id: secondId, haste: hastes[1], role: roles[1] }, { ...page, lane: next }), { scroll: false }));
  };

  // The address follows the page once it has arrived: each champion's own id (a name or another
  // spelling reads as its id), the hastes and builds roles chosen here, the lane, the queue and the builds' source, nothing for a champion the roster lacks.
  React.useEffect(() => {
    if (pending) return;
    const want = intelHref({ id: first, haste: hastes[0], role: roles[0] }, secondId ? { id: secondId, haste: hastes[1], role: roles[1] } : null, { lane: secondId ? lane : null, queue, source: buildsSource });
    if (`${window.location.pathname}${window.location.search}` !== want) window.history.replaceState(window.history.state, "", want);
  }, [pending, first, secondId, hastes, roles, lane, queue, buildsSource]);

  // Each champion shown joins the window's Recent row.
  React.useEffect(() => {
    if (first) remember(first);
  }, [first, remember]);
  React.useEffect(() => {
    if (secondId) remember(secondId);
  }, [secondId, remember]);

  // "/" opens the window of every champion for the champion whose column holds the focus, else the
  // first (the search's own "/" where none is shown).
  React.useEffect(() => {
    if (!first) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      const which: Which = secondId && t?.closest('[data-panel="2"]') ? 1 : 0;
      openerRef.current = document.querySelector<HTMLElement>(`[data-panel="${which + 1}"] [data-testid="lookup-change"]`);
      setPicking(which);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [first, secondId]);

  const loadingNames = ([0, 1] as const).map(loadingOf).filter((c): c is ChampionChoice => !!c).map((c) => c.name);
  const loadingWords = loadingNames.length ? `Loading ${loadingNames.join(" and ")}…` : "";
  const recentChoices = recent.map((id) => byId.get(id)).filter((c): c is ChampionChoice => !!c);
  function openPicker(which: Which, opener: HTMLElement) {
    openerRef.current = opener;
    setPicking(which);
  }
  const columnFor = (which: Which): { look: LookupChampion | null; shown: ChampionChoice | null; loading: boolean; builds: React.ReactNode } => {
    const own = order[which]!;
    const target = loadingOf(which);
    // Each column's builds read and set that column's role and the page's queue and source, know whether they sit on Compare's rows, and Matchup Intel's lane.
    const builds = own.builds ? (
      <BuildsChoiceProvider value={{ role: roles[which], setRole: (r) => setRoles((now) => (which === 0 ? [r, now[1]] : [now[0], r])), queue, setQueue, source: buildsSource, setSource: setBuildsSource, compare: !!order[1 - which]!.look || !!loadingOf((1 - which) as Which), lane }}>{own.builds}</BuildsChoiceProvider>
    ) : null;
    return { look: own.look, shown: target ?? own.look?.champion ?? null, loading: !!target, builds };
  };
  const one = columnFor(0);
  const two = columnFor(1);
  const both = !!one.shown && !!two.shown;
  const keys = columnKeys(one.shown?.id ?? null, two.shown?.id ?? null);

  const ranks: [number, number] = [rankColumns(one.look?.abilities), rankColumns(two.look?.abilities)];
  // Each column's statistics (none for a champion whose statistics are not stored), aligned in Compare.
  const statLines: [StatLine[], StatLine[]] = [columnStats(one.look?.facts, two.look?.facts, both), columnStats(two.look?.facts, one.look?.facts, both)];
  // Compare: the other column's "Changed since" mark, whose room a column without one keeps.
  const changedTwins: [string | null, string | null] = both ? [statLines[1].length ? (two.look?.facts?.statsChangedSincePatch ?? null) : null, statLines[0].length ? (one.look?.facts?.statsChangedSincePatch ?? null) : null] : [null, null];
  const mode = both ? "compare" : "single";
  // The band: the page's own for the lane it was built for; its skeleton while a lane chosen here is on its way.
  const laneShown = both ? lane : null;
  const bandArrived = !!matchup && laneShown !== null && laneShown === initialLane && !swapping;
  const band = laneShown === null ? null : bandArrived ? matchup : pending ? <MatchupBandLoading /> : matchup ?? null;

  return (
    <div className="space-y-3" data-testid="lookup-view" data-ready={ready ? "true" : undefined} data-champions={both ? "2" : one.shown ? "1" : "0"}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className={PAGE_TITLE}>Champion Intel</h1>
          <p className="text-sm text-fg-muted" data-testid="lookup-source">
            {source}
          </p>
        </div>
        {one.shown && !two.shown ? (
          <button type="button" onClick={(e) => openPicker(1, e.currentTarget)} aria-haspopup="dialog" className={toolbarButtonClass(false)} data-testid="lookup-add">
            <Columns2 className="h-4 w-4" aria-hidden />
            Compare
          </button>
        ) : both ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Matchup Intel's lane: icons with the chosen one named; "No lane" is Compare as it was. */}
            <RoleSegmented label={laneControlLabel(one.shown!.name, two.shown!.name)} roles={ROLES} value={lane} onChange={chooseLane} allowAll noneLabel={NO_LANE} compactBelow="always" disabled={pending} testId="lookup-lane" />
            {/* aria-disabled while a change is on its way, never `disabled`: a disabled button would drop the focus of the keyboard that pressed it. */}
            <button type="button" onClick={swap} aria-disabled={pending || undefined} aria-label={`Swap ${one.shown!.name} and ${two.shown!.name}`} className={toolbarButtonClass(false, "aria-disabled:cursor-not-allowed aria-disabled:text-fg-disabled aria-disabled:hover:border-border-control aria-disabled:hover:text-fg-disabled")} data-testid="lookup-swap">
              <ArrowLeftRight className="h-4 w-4" aria-hidden />
              Swap
            </button>
          </div>
        ) : null}
      </header>
      {dropped ? (
        <p role="status" className="rounded-panel border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-fg" data-testid="lookup-unknown">
          This address names a champion that is not on the roster, so it was left out.{one.shown ? "" : " Choose one below."}
        </p>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite" data-testid="lookup-status">
        {loadingWords}
      </p>
      {band ? (
        <PageQueueProvider value={{ queue, setQueue }}>
          <div className={cn("transition-opacity", pending && "opacity-60")} aria-busy={pending || undefined} data-testid="matchup-slot">
            {band}
          </div>
        </PageQueueProvider>
      ) : null}
      {one.shown ? (
        <div
          // With Matchup Intel's lane, each ability row's rank-1 cell is tinted: the ranks of a lane's first levels.
          className={cn("@container/board panel-depth overflow-hidden rounded-panel border border-border bg-surface", laneShown && "[&_[data-rank='1']]:rounded-sm [&_[data-rank='1']]:bg-surface-2 [&_[data-rank='1']]:px-0.5")}
          data-testid="lookup-board"
          data-layout={both ? "compare" : "single"}
          data-lane={laneShown ?? undefined}
        >
          <div className={both ? "grid grid-cols-1 @min-[22rem]/board:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)] @min-[22rem]/board:grid-rows-[repeat(21,auto)]" : undefined}>
            {both ? <KeyColumn builds={!!(one.builds || two.builds)} /> : null}
            <ChampionPanel
                key={keys[0]}
                mode={mode}
                which={0}
                lookup={one.look}
                shown={one.shown!}
                pending={one.loading}
                haste={hastes[0]}
                onHaste={(h) => setHastes((now) => [h, now[1]])}
                onChange={(e) => openPicker(0, e.currentTarget)}
                onRemove={both ? () => remove(0) : undefined}
                removeWaits={pending}
                ranks={ranks[0]}
                statLines={statLines[0]}
                changedTwin={changedTwins[0]}
                builds={one.builds}
                statsOpen={both ? statsOpen : undefined}
                onStatsToggle={both ? setStatsOpen : undefined}
                side={laneShown ? PLAYING_LABEL : null}
              />
            {both ? (
              <ChampionPanel
                key={keys[1]}
                mode={mode}
                which={1}
                lookup={two.look}
                shown={two.shown!}
                pending={two.loading}
                haste={hastes[1]}
                onHaste={(h) => setHastes((now) => [now[0], h])}
                onChange={(e) => openPicker(1, e.currentTarget)}
                onRemove={() => remove(1)}
                removeWaits={pending}
                ranks={ranks[1]}
                statLines={statLines[1]}
                changedTwin={changedTwins[1]}
                builds={two.builds}
                statsOpen={statsOpen}
                onStatsToggle={setStatsOpen}
                side={laneShown ? AGAINST_LABEL : null}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <section aria-labelledby="lookup-choose" className="space-y-3 pt-1" data-testid="lookup-empty">
          <div>
            <h2 id="lookup-choose" className="text-base font-semibold text-fg">
              Choose a champion
            </h2>
            <p className="mt-1 text-sm text-fg-muted">Search, or open All champions, for its abilities, cooldowns, costs and base stats. Compare puts a second champion beside it.</p>
          </div>
          <div className="@container/toolbar">
            <div className="flex flex-wrap items-center gap-2" data-testid="lookup-toolbar" data-ready={ready ? "true" : undefined}>
              <ChampionSearch champions={champions} onPick={(id) => go(0, id)} className="w-full @min-[34rem]/toolbar:w-72 @min-[34rem]/toolbar:flex-none" />
              <button type="button" onClick={(e) => openPicker(0, e.currentTarget)} aria-haspopup="dialog" className={toolbarButtonClass(false)} data-testid="lookup-browse">
                <LayoutGrid className="h-4 w-4" aria-hidden />
                All champions
              </button>
            </div>
          </div>
          {recentChoices.length ? (
            <ul className="flex flex-wrap gap-2" aria-label="Looked up lately" data-testid="lookup-recent">
              {recentChoices.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => go(0, c.id)} className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface py-1 pl-1 pr-3 text-sm font-medium text-fg transition-colors hover:border-border-strong hover:text-accent-strong" data-champion={c.id}>
                    <span aria-hidden className="shrink-0">
                      <ChampionPortrait champion={{ id: c.id, name: c.name, portraitUrl: c.portrait }} size="sm" />
                    </span>
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}
      {picking !== null ? (
        <ChampionPickerWindow
          champions={champions}
          selected={picking === 0 ? first : secondId}
          recent={recentChoices}
          title={picking === 1 && !secondId ? "Compare with" : "All champions"}
          onPick={(id) => {
            // The chosen champion's name takes the focus once it has arrived (Compare is gone by then).
            if (go(picking, id)) focusAfter.current = picking;
          }}
          onClose={() => {
            setPicking(null);
            // Closed without a choice: back to what opened it.
            if (focusAfter.current === null) openerRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </div>
  );
}

