"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Plus } from "lucide-react";
import type { ChampionChoice } from "@/domain/champion-lookup/types";
import type { LookupChampion } from "@/domain/champion-lookup/view";
import { clampHaste } from "@/domain/champion-lookup/haste";
import { DATA_LIMIT_WORDS, HASTE_RULE_WORDS } from "@/domain/champion-lookup/words";
import { ChampionPortrait } from "@/components/champion-portrait";
import { toolbarButtonClass } from "@/components/ui/filter-bar";
import { PAGE_TITLE } from "@/components/ui/page-header";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { intelHref } from "./address";
import { ChampionPanel } from "./champion-panel";
import { ChampionPickerWindow } from "./champion-picker";
import { ChampionSearch } from "./champion-search";
import { useRecentLookups } from "./recent";

/*
  CHAMPION INTEL's page in the browser (docs/CHAMPION_INTEL.md): the title with where the numbers
  come from and the quiet Add champion, then one champion's panel, or two side by side, each with
  its own haste and folds, then the rule's line and what Riot's data does not hold, said once.

  The address carries both champions and both hastes
  (/lookup?champion=Ahri&haste=20&champion2=Jinx&haste2=0), so a reload or a shared link opens the
  same; they are the page's state, like a filter, so a change replaces the address and never adds a
  history entry (Back leaves the page in one step). A champion chosen (from its name, which opens
  the window of every champion, or Add champion) is built on the server: until it arrives, its panel
  says what is loading and is out of reach. A haste changes the numbers here at once, with no
  request. "/" opens the window for the champion in view.

  Two panels sit side by side where the page is 56rem wide (a desktop); narrower (a tablet, a phone)
  one shows at a time under a switcher of the two champions. Both stay in the page, the other hidden,
  so each keeps its haste and its open folds while the other is read.
*/

type Which = 0 | 1;

/** The switcher between two champions where only one panel shows (below 56rem). */
function Switcher({ champions, active, onChange }: { champions: [ChampionChoice, ChampionChoice]; active: Which; onChange: (w: Which) => void }) {
  return (
    <div role="group" aria-label="Champion shown" className={cn(segmentedGroupClass("w-full"), "@min-[56rem]/intel:hidden")} data-testid="lookup-switcher">
      {champions.map((c, i) => (
        <button key={i} type="button" aria-pressed={active === i} onClick={() => onChange(i as Which)} className={segmentClass(active === i, { size: "md", className: "min-w-0 flex-1 gap-2" })} data-champion={c.id} data-panel={i + 1}>
          <span aria-hidden className="shrink-0">
            <ChampionPortrait champion={{ id: c.id, name: c.name, portraitUrl: c.portrait }} size="xs" className="h-5 w-5" />
          </span>
          <span className="min-w-0 truncate">{c.name}</span>
        </button>
      ))}
    </div>
  );
}

const subscribeNothing = () => () => undefined;

export function LookupView({
  champions,
  lookup,
  second,
  initialHaste,
  initialHaste2,
  source,
  dropped,
}: {
  champions: ChampionChoice[];
  lookup: LookupChampion | null;
  second: LookupChampion | null;
  initialHaste: number;
  initialHaste2: number;
  /** The source line beside the title (Riot Data Dragon's version, its patch, the game's patch). */
  source: React.ReactNode;
  dropped: boolean;
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
  const [picking, setPicking] = React.useState<Which | null>(null);
  const [active, setActive] = React.useState<Which>(0);
  // The second champion, removed: gone at once, while the address catches up.
  const [removed, setRemoved] = React.useState<string | null>(null);
  const { recent, remember } = useRecentLookups();
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const first = lookup?.champion.id ?? null;
  const shownSecond = second && second.champion.id !== removed ? second : null;
  const secondId = shownSecond?.champion.id ?? null;
  const openerRef = React.useRef<HTMLElement | null>(null);
  // A panel is out of reach (inert) while its champion loads, and the whole page while the window is
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

  /** Builds the champion chosen for a panel on the server; false when nothing changes (the same champion, or none known). */
  const go = (which: Which, id: string): boolean => {
    const c = byId.get(id);
    if (!c) return false;
    const current = which === 0 ? first : secondId;
    if (id === current && !pending) return false;
    setRemoved(null);
    setTarget({ which, champion: c });
    const nextHastes: [number, number] = which === 1 && !secondId ? [hastes[0], 0] : hastes;
    if (which === 1 && !secondId) {
      setHastes(nextHastes);
      setActive(1);
    }
    const a = which === 0 ? id : first;
    const b = which === 1 ? id : secondId;
    startTransition(() => router.replace(intelHref({ id: a, haste: nextHastes[0] }, b ? { id: b, haste: nextHastes[1] } : null), { scroll: false }));
    return true;
  };

  const remove = () => {
    if (!secondId) return;
    setRemoved(secondId);
    setTarget(null);
    setHastes([hastes[0], 0]);
    setActive(0);
    // The focus goes back to the champion that stays, once the address has caught up.
    focusAfter.current = 0;
    startTransition(() => router.replace(intelHref({ id: first, haste: hastes[0] }), { scroll: false }));
  };

  // The address follows the page once it has arrived: each champion's own id (a name or another
  // spelling reads as its id), the hastes chosen here, nothing for a champion the roster lacks.
  React.useEffect(() => {
    if (pending) return;
    const want = intelHref({ id: first, haste: hastes[0] }, secondId ? { id: secondId, haste: hastes[1] } : null);
    if (`${window.location.pathname}${window.location.search}` !== want) window.history.replaceState(window.history.state, "", want);
  }, [pending, first, secondId, hastes]);

  // Each champion shown joins the window's Recent row.
  React.useEffect(() => {
    if (first) remember(first);
  }, [first, remember]);
  React.useEffect(() => {
    if (secondId) remember(secondId);
  }, [secondId, remember]);

  // "/" opens the window of every champion for the champion in view: the one the switcher shows
  // where only one panel shows, else the first (the search's own "/" where none is shown).
  React.useEffect(() => {
    if (!first) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      const switcher = document.querySelector<HTMLElement>('[data-testid="lookup-switcher"]');
      const which: Which = secondId && switcher && switcher.offsetParent !== null ? active : 0;
      openerRef.current = document.querySelector<HTMLElement>(`[data-panel="${which + 1}"] [data-testid="lookup-change"]`);
      setPicking(which);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [first, secondId, active]);

  const loadingWords = pending && target ? `Loading ${target.champion.name}…` : "";
  const recentChoices = recent.map((id) => byId.get(id)).filter((c): c is ChampionChoice => !!c);
  function openPicker(which: Which, opener: HTMLElement) {
    openerRef.current = opener;
    setPicking(which);
  }
  const panelFor = (which: Which): { look: LookupChampion | null; shown: ChampionChoice | null; loading: boolean } => {
    const own = which === 0 ? lookup : shownSecond;
    const loading = pending && target?.which === which;
    return { look: own, shown: loading ? target!.champion : (own?.champion ?? null), loading };
  };
  const one = panelFor(0);
  const two = panelFor(1);
  const both = !!one.shown && !!two.shown;

  return (
    <div className="@container/intel space-y-3" data-testid="lookup-view" data-ready={ready ? "true" : undefined} data-champions={both ? "2" : one.shown ? "1" : "0"}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className={PAGE_TITLE}>Champion Intel</h1>
          <p className="text-xs text-fg-muted" data-testid="lookup-source">
            {source}
          </p>
        </div>
        {one.shown && !two.shown ? (
          <button type="button" onClick={(e) => openPicker(1, e.currentTarget)} aria-haspopup="dialog" className="-mr-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent md:pointer-fine:min-h-8" data-testid="lookup-add">
            <Plus className="h-4 w-4" aria-hidden />
            Add champion
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
        <>
          {both ? <Switcher champions={[one.shown, two.shown!]} active={active} onChange={setActive} /> : null}
          <div className={cn("grid grid-cols-1 items-start gap-3", both && "@min-[56rem]/intel:grid-cols-2")}>
            <ChampionPanel
              lookup={one.look}
              shown={one.shown}
              pending={one.loading}
              haste={hastes[0]}
              onHaste={(h) => setHastes(([, b]) => [h, b])}
              onChange={(e) => openPicker(0, e.currentTarget)}
              idPrefix="intel-1"
              className={both && active !== 0 ? "@max-[56rem]/intel:hidden" : undefined}
            />
            {two.shown ? (
              <ChampionPanel
                second
                lookup={two.look}
                shown={two.shown}
                pending={two.loading}
                haste={hastes[1]}
                onHaste={(h) => setHastes(([a]) => [a, h])}
                onChange={(e) => openPicker(1, e.currentTarget)}
                onRemove={remove}
                idPrefix="intel-2"
                className={active !== 1 ? "@max-[56rem]/intel:hidden" : undefined}
              />
            ) : null}
          </div>
          {one.look?.abilities || two.look?.abilities ? (
            <div className="space-y-0.5 text-xs text-fg-subtle" data-testid="lookup-rule">
              <p>{HASTE_RULE_WORDS}</p>
              <p data-testid="lookup-data-limit">{DATA_LIMIT_WORDS}</p>
            </div>
          ) : null}
        </>
      ) : (
        <section aria-labelledby="lookup-choose" className="space-y-3 rounded-panel border border-dashed border-border-strong px-4 py-5" data-testid="lookup-empty">
          <div>
            <h2 id="lookup-choose" className="text-base font-semibold text-fg">
              Choose a champion
            </h2>
            <p className="mt-1 text-sm text-fg-muted">Search, or open All champions, to see its abilities, cooldowns and key mechanics. A second champion can be added beside it.</p>
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
                  <button type="button" onClick={() => go(0, c.id)} className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface py-1 pl-1 pr-3 text-sm font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg" data-champion={c.id}>
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
          title={picking === 1 && !secondId ? "Add a champion" : "All champions"}
          onPick={(id) => {
            // The chosen champion's name takes the focus once it has arrived (Add champion is gone by then).
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
