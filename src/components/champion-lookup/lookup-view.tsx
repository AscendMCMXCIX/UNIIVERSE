"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Columns2, LayoutGrid } from "lucide-react";
import type { ChampionChoice } from "@/domain/champion-lookup/types";
import type { LookupChampion } from "@/domain/champion-lookup/view";
import { alignedStats, listedStats, rankColumns } from "@/domain/champion-lookup/board";
import { clampHaste } from "@/domain/champion-lookup/haste";
import { SLOTS } from "@/domain/champion-lookup/types";
import type { Role } from "@/domain/roles";
import { ChampionPortrait } from "@/components/champion-portrait";
import { toolbarButtonClass } from "@/components/ui/filter-bar";
import { PAGE_TITLE } from "@/components/ui/page-header";
import { intelHref, swappedHref, withoutHref } from "./address";
import { SlotKey } from "./ability-list";
import type { StatLine } from "./base-stats";
import { BuildsRoleProvider } from "./builds-role";
import { ChampionPanel } from "./champion-panel";
import { ChampionPickerWindow } from "./champion-picker";
import { ChampionSearch } from "./champion-search";
import { useRecentLookups } from "./recent";

/*
  CHAMPION INTEL's page in the browser (docs/CHAMPION_INTEL.md): the title with where the numbers
  come from and, at its right, Compare (one champion) or Swap (two); then the board: one champion,
  or two side by side as one aligned board.

  The address carries both champions, both hastes and the role each builds section shows where one
  was chosen (/lookup?champion=Ahri&haste=20&champion2=Jinx&haste2=0&role2=ADC), so a reload or a
  shared link opens the same; they are the page's state, like a filter, so a change replaces the address and never adds a
  history entry (Back leaves the page in one step). A champion chosen (from its name, which opens the
  window of every champion, or Compare) is built on the server: until it arrives, its column says
  what is loading and is out of reach. A haste, and a builds section's role, change the page here at
  once, with no request.
  Swap and ✕ show their result at once too, while the address catches up. "/" opens the window for
  the champion whose column holds the focus (else the first).

  Compare (the owner's request of 25 Nov 2026) is one board: a narrow column of the slots' keys,
  then each champion's column, a subgrid of the board's ten rows (header, facts, the abilities'
  heading, P, Q, W, E, R, builds, base statistics), so every row of the two champions lines up,
  side by side at every width from a phone up; only where the board is under 17rem (a small phone at
  a large text size) the two columns stack. Two neutral references: no colour or word says which
  value is better, no difference is computed.
*/

type Which = 0 | 1;

const subscribeNothing = () => () => undefined;

/** Two keys for the two columns, the champion's own id, so a column's folds travel with its champion on a swap (the same champion twice: the second gets its own). */
function columnKeys(a: string | null, b: string | null): [string, string] {
  const first = a ?? "none";
  const second = b ?? "none";
  return [first, second === first ? `${second}~2` : second];
}

/** A column's base statistics as it lists them: its own (one champion), or aligned with the other's row by row (Compare). */
function statLinesOf(own: LookupChampion | null, other: LookupChampion | null, both: boolean, side: Which): StatLine[] {
  if (!both) return listedStats(own?.facts).map((row) => ({ key: row.key, label: row.label, row }));
  const rows = side === 0 ? alignedStats(own?.facts, other?.facts) : alignedStats(other?.facts, own?.facts);
  return rows.map((r) => {
    const mine = side === 0 ? r.a : r.b;
    const theirs = side === 0 ? r.b : r.a;
    return { key: r.key, label: (mine ?? theirs)!.label, row: mine };
  });
}

/** Compare's narrow first column: each ability row's slot key, level with both champions' rows (drawn; each row's heading names its slot). */
function KeyColumn({ builds }: { builds: boolean }) {
  return (
    <div aria-hidden className="col-start-1 row-span-full hidden grid-rows-subgrid @min-[17rem]/board:grid" data-testid="lookup-key-column">
      <span className="row-start-2 border-b border-border" />
      <span className="row-start-3 border-b border-border" />
      {SLOTS.map((slot, i) => (
        <span key={slot} className="flex justify-center border-b border-border pt-2 @min-[59.25rem]/board:pt-3" style={{ gridRowStart: 4 + i }}>
          <SlotKey slot={slot} />
        </span>
      ))}
      {builds ? <span className="row-start-9 border-b border-border" /> : null}
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
  source,
  dropped,
  builds,
}: {
  champions: ChampionChoice[];
  lookup: LookupChampion | null;
  second: LookupChampion | null;
  initialHaste: number;
  initialHaste2: number;
  /** The role each champion's builds section shows, from the address (role, role2); null for its default. */
  initialRoles?: [Role | null, Role | null];
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
}) {
  const router = useRouter();
  // False on the server and while the page hydrates, then true: the page says when its controls answer.
  const ready = React.useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [pending, startTransition] = React.useTransition();
  const [target, setTarget] = React.useState<{ which: Which; champion: ChampionChoice } | null>(null);
  const [hastes, setHastes] = React.useState<[number, number]>([clampHaste(initialHaste), clampHaste(initialHaste2)]);
  // An address opened from elsewhere (a link, the browser's own navigation) brings its own hastes.
  const [seen, setSeen] = React.useState<[number, number]>([initialHaste, initialHaste2]);
  if (seen[0] !== initialHaste || seen[1] !== initialHaste2) {
    setSeen([initialHaste, initialHaste2]);
    setHastes([clampHaste(initialHaste), clampHaste(initialHaste2)]);
  }
  // Each builds section's role (the page's state, like the hastes); an address from elsewhere brings its own.
  const [roleA, roleB] = initialRoles ?? [null, null];
  const [roles, setRoles] = React.useState<[Role | null, Role | null]>([roleA, roleB]);
  const [seenRoles, setSeenRoles] = React.useState<[Role | null, Role | null]>([roleA, roleB]);
  if (seenRoles[0] !== roleA || seenRoles[1] !== roleB) {
    setSeenRoles([roleA, roleB]);
    setRoles([roleA, roleB]);
  }
  const [picking, setPicking] = React.useState<Which | null>(null);
  // Compare's two statistics folds, open or closed together.
  const [statsOpen, setStatsOpen] = React.useState(false);
  const { recent, remember } = useRecentLookups();
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);

  // Swap and ✕ show their result at once, while the address catches up: each holds the page's
  // champions as they were when it was pressed, and stops applying once the page has new ones.
  const propsKey = `${lookup?.champion.id ?? ""}|${second?.champion.id ?? ""}|${initialHaste}|${initialHaste2}`;
  const [removed, setRemoved] = React.useState<{ which: Which; key: string } | null>(null);
  const [swapped, setSwapped] = React.useState<string | null>(null);
  const removing = removed && removed.key === propsKey ? removed.which : null;
  const swapping = swapped === propsKey && pending;
  const base: Array<{ look: LookupChampion | null; builds: React.ReactNode }> = [
    { look: lookup, builds: builds?.first ?? null },
    { look: second, builds: builds?.second ?? null },
  ];
  const order: Array<{ look: LookupChampion | null; builds: React.ReactNode }> = removing === 0 ? [base[1]!, { look: null, builds: null }] : removing === 1 ? [base[0]!, { look: null, builds: null }] : swapping ? [base[1]!, base[0]!] : base;
  const first = order[0]!.look?.champion.id ?? null;
  const secondId = order[1]!.look?.champion.id ?? null;
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

  /** Builds the champion chosen for a column on the server; false when nothing changes (the same champion, or none known). */
  const go = (which: Which, id: string): boolean => {
    const c = byId.get(id);
    if (!c) return false;
    const current = which === 0 ? first : secondId;
    if (id === current && !pending) return false;
    setRemoved(null);
    setSwapped(null);
    setTarget({ which, champion: c });
    const nextHastes: [number, number] = which === 1 && !secondId ? [hastes[0], 0] : hastes;
    if (which === 1 && !secondId) setHastes(nextHastes);
    // A new champion's builds open on their own default role.
    const nextRoles: [Role | null, Role | null] = which === 0 ? [null, roles[1]] : [roles[0], null];
    setRoles(nextRoles);
    const a = which === 0 ? id : first;
    const b = which === 1 ? id : secondId;
    startTransition(() => router.replace(intelHref({ id: a, haste: nextHastes[0], role: nextRoles[0] }, b ? { id: b, haste: nextHastes[1], role: nextRoles[1] } : null), { scroll: false }));
    return true;
  };

  /** ✕ on either column: the other stays, as the first, with its own haste. */
  const remove = (which: Which) => {
    if (!first || !secondId) return;
    const stays = which === 0 ? hastes[1] : hastes[0];
    const href = withoutHref({ id: first, haste: hastes[0], role: roles[0] }, { id: secondId, haste: hastes[1], role: roles[1] }, which);
    setRemoved({ which, key: propsKey });
    setSwapped(null);
    setTarget(null);
    setHastes([stays, 0]);
    setRoles([which === 0 ? roles[1] : roles[0], null]);
    // The focus goes to the champion that stays, once the address has caught up.
    focusAfter.current = 0;
    startTransition(() => router.replace(href, { scroll: false }));
  };

  /** Swap: the two champions change places, each with its own haste and its open folds. */
  const swap = () => {
    if (!first || !secondId) return;
    const href = swappedHref({ id: first, haste: hastes[0], role: roles[0] }, { id: secondId, haste: hastes[1], role: roles[1] });
    setSwapped(propsKey);
    setRemoved(null);
    setTarget(null);
    setHastes([hastes[1], hastes[0]]);
    setRoles([roles[1], roles[0]]);
    startTransition(() => router.replace(href, { scroll: false }));
  };

  // The address follows the page once it has arrived: each champion's own id (a name or another
  // spelling reads as its id), the hastes and builds roles chosen here, nothing for a champion the roster lacks.
  React.useEffect(() => {
    if (pending) return;
    const want = intelHref({ id: first, haste: hastes[0], role: roles[0] }, secondId ? { id: secondId, haste: hastes[1], role: roles[1] } : null);
    if (`${window.location.pathname}${window.location.search}` !== want) window.history.replaceState(window.history.state, "", want);
  }, [pending, first, secondId, hastes, roles]);

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

  const loadingWords = pending && target ? `Loading ${target.champion.name}…` : "";
  const recentChoices = recent.map((id) => byId.get(id)).filter((c): c is ChampionChoice => !!c);
  function openPicker(which: Which, opener: HTMLElement) {
    openerRef.current = opener;
    setPicking(which);
  }
  const columnFor = (which: Which): { look: LookupChampion | null; shown: ChampionChoice | null; loading: boolean; builds: React.ReactNode } => {
    const own = order[which]!;
    const loading = pending && target?.which === which;
    // Each column's builds read and set that column's role.
    const builds = own.builds ? <BuildsRoleProvider value={{ role: roles[which], setRole: (r) => setRoles((now) => (which === 0 ? [r, now[1]] : [now[0], r])) }}>{own.builds}</BuildsRoleProvider> : null;
    return { look: own.look, shown: loading ? target!.champion : (own.look?.champion ?? null), loading, builds };
  };
  const one = columnFor(0);
  const two = columnFor(1);
  const both = !!one.shown && !!two.shown;
  const keys = columnKeys(one.shown?.id ?? null, two.shown?.id ?? null);

  const ranks: [number, number] = [rankColumns(one.look?.abilities), rankColumns(two.look?.abilities)];
  const statLines: [StatLine[], StatLine[]] = [statLinesOf(one.look, two.look, both, 0), statLinesOf(two.look, one.look, both, 1)];
  const mode = both ? "compare" : "single";

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
          <button type="button" onClick={swap} disabled={pending} aria-label={`Swap ${one.shown!.name} and ${two.shown!.name}`} className={toolbarButtonClass(false, "disabled:cursor-not-allowed disabled:text-fg-disabled")} data-testid="lookup-swap">
            <ArrowLeftRight className="h-4 w-4" aria-hidden />
            Swap
          </button>
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
      {one.shown ? (
        <div className="@container/board panel-depth overflow-hidden rounded-panel border border-border bg-surface" data-testid="lookup-board" data-layout={both ? "compare" : "single"}>
          <div className={both ? "grid grid-cols-1 @min-[17rem]/board:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)] @min-[17rem]/board:grid-rows-[repeat(10,auto)]" : undefined}>
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
                ranks={ranks[0]}
                statLines={statLines[0]}
                builds={one.builds}
                statsOpen={both ? statsOpen : undefined}
                onStatsToggle={both ? setStatsOpen : undefined}
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
                ranks={ranks[1]}
                statLines={statLines[1]}
                builds={two.builds}
                statsOpen={statsOpen}
                onStatsToggle={setStatsOpen}
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

