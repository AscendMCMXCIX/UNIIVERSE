"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, LoaderCircle } from "lucide-react";
import type { ChampionChoice } from "@/domain/champion-lookup/types";
import type { LookupChampion } from "@/domain/champion-lookup/view";
import { HASTE_CHOICES, HASTE_MAX, clampHaste, hasteReduction } from "@/domain/champion-lookup/haste";
import { HASTE_RULE_WORDS } from "@/domain/champion-lookup/words";
import { ChampionPortrait } from "@/components/champion-portrait";
import { toolbarButtonClass } from "@/components/ui/filter-bar";
import { formatSeconds } from "@/lib/format";
import { cn } from "@/lib/cn";
import { lookupHref } from "./address";
import { AbilityList } from "./ability-list";
import { ChampionPickerWindow } from "./champion-picker";
import { ChampionSearch } from "./champion-search";
import { useRecentLookups } from "./recent";

/*
  CHAMPION LOOKUP's controls and abilities (docs/CHAMPION_LOOKUP.md): the search and All champions
  in the toolbar, then one panel with the champion, the haste choice and its five abilities, then
  the rule. The address carries the champion and the haste (/lookup?champion=Ahri&haste=20), so a
  reload or a shared link opens the same; both are the page's state, like a filter, so a change
  replaces the address and never adds a history entry (Back leaves the page in one step). A champion
  is built on the server: until it arrives, the panel says what is loading and is out of reach. A
  haste changes the numbers here at once, with no request. Descriptions are folded away by default,
  one press shows them all.
*/

/** The haste choice: the quick values as one press each, then any whole number to HASTE_MAX typed. */
function HasteChoice({ haste, onChange }: { haste: number; onChange: (haste: number) => void }) {
  const id = React.useId();
  const preset = (HASTE_CHOICES as readonly number[]).includes(haste);
  const [typed, setTyped] = React.useState(preset ? "" : String(haste));
  const [held, setHeld] = React.useState(false);
  // A haste set from elsewhere (a quick value) empties the field; one typed keeps what was typed.
  const [seen, setSeen] = React.useState(haste);
  if (seen !== haste) {
    setSeen(haste);
    if (preset) setTyped("");
  }
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5 @min-[34rem]/panel:w-auto" data-testid="lookup-haste" data-haste={haste}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span id={`${id}-label`} className="label-caps">
          Ability haste
        </span>
        <span className="text-xs text-fg-subtle" data-testid="lookup-haste-cut" aria-live="polite">
          {haste > 0 ? `Cooldowns ${formatSeconds(hasteReduction(haste))}% shorter` : "Base cooldowns"}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div role="group" aria-labelledby={`${id}-label`} className="grid min-w-0 flex-1 grid-cols-5 gap-0.5 rounded-lg border border-border-control bg-bg-elevated p-0.5 @min-[34rem]/panel:flex-none @min-[34rem]/panel:grid-cols-9">
          {HASTE_CHOICES.map((h) => (
            <button
              key={h}
              type="button"
              aria-pressed={h === haste}
              onClick={() => {
                setTyped("");
                setHeld(false);
                onChange(h);
              }}
              className={cn("min-h-11 min-w-0 rounded-md px-1 text-sm font-medium tabular-nums @min-[34rem]/panel:min-w-10 transition-colors md:pointer-fine:min-h-8 md:pointer-fine:min-w-9 md:pointer-fine:text-xs", h === haste ? "bg-accent/15 font-semibold text-fg ring-1 ring-inset ring-accent/60" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}
              data-haste={h}
            >
              {h}
            </button>
          ))}
        </div>
        <label htmlFor={`${id}-other`} className="sr-only">
          Other ability haste, a whole number from 0 to {HASTE_MAX}
        </label>
        <input
          id={`${id}-other`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          placeholder="Other"
          value={typed}
          aria-describedby={held ? `${id}-held` : undefined}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, "");
            setTyped(digits);
            setHeld(digits !== "" && Number(digits) > HASTE_MAX);
            onChange(clampHaste(digits));
          }}
          onBlur={() => {
            // Shown as it is taken: a value above the maximum reads as the maximum, an empty field stays empty.
            if (typed !== "") setTyped(String(clampHaste(typed)));
          }}
          className={cn("h-11 w-20 shrink-0 rounded-md border bg-bg-elevated px-2.5 text-base tabular-nums text-fg placeholder:text-fg-subtle hover:border-fg-subtle focus:border-accent focus:outline-none md:pointer-fine:h-9 md:pointer-fine:text-sm", !preset && typed !== "" ? "border-accent/60" : "border-border-control")}
          data-testid="lookup-haste-input"
        />
        {held ? (
          <span id={`${id}-held`} className="text-xs text-warn" data-testid="lookup-haste-held">
            Held to {HASTE_MAX}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const subscribeNothing = () => () => undefined;

export function LookupView({ champions, lookup, initialHaste }: { champions: ChampionChoice[]; lookup: LookupChampion | null; initialHaste: number }) {
  const router = useRouter();
  // False on the server and while the page hydrates, then true: the toolbar says when its controls answer.
  const ready = React.useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [pending, startTransition] = React.useTransition();
  const [target, setTarget] = React.useState<ChampionChoice | null>(null);
  const [haste, setHaste] = React.useState(clampHaste(initialHaste));
  // An address opened from elsewhere (a link, the browser's own navigation) brings its own haste.
  const [seenHaste, setSeenHaste] = React.useState(initialHaste);
  if (seenHaste !== initialHaste) {
    setSeenHaste(initialHaste);
    setHaste(clampHaste(initialHaste));
  }
  const [descriptions, setDescriptions] = React.useState(false);
  const [browsing, setBrowsing] = React.useState(false);
  const { recent, remember } = useRecentLookups();
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const current = lookup?.champion.id ?? null;
  const browseRef = React.useRef<HTMLButtonElement>(null);

  const go = (id: string) => {
    const c = byId.get(id);
    if (!c || (id === current && !pending)) return;
    setTarget(c);
    startTransition(() => router.replace(lookupHref(id, haste), { scroll: false }));
  };

  // The address follows the page once it has arrived: the champion's own id (a name or another
  // spelling reads as its id), the haste chosen here, nothing for a champion the roster lacks.
  React.useEffect(() => {
    if (pending) return;
    const want = lookupHref(current, haste);
    if (`${window.location.pathname}${window.location.search}` !== want) window.history.replaceState(null, "", want);
  }, [pending, current, haste]);

  // Each champion shown joins the window's Recent row.
  React.useEffect(() => {
    if (current) remember(current);
  }, [current, remember]);

  const shown = pending && target ? target : (lookup?.champion ?? null);
  const loading = pending && target ? `Loading ${target.name}…` : "";
  const recentChoices = recent.map((id) => byId.get(id)).filter((c): c is ChampionChoice => !!c);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" data-testid="lookup-toolbar" data-ready={ready ? "true" : undefined}>
        <ChampionSearch champions={champions} onPick={go} className="w-full min-[30rem]:w-72 min-[30rem]:flex-none" />
        <button ref={browseRef} type="button" onClick={() => setBrowsing(true)} aria-haspopup="dialog" className={toolbarButtonClass(false)} data-testid="lookup-browse">
          <LayoutGrid className="h-4 w-4" aria-hidden />
          All champions
        </button>
        {lookup?.abilities ? (
          <button type="button" aria-pressed={descriptions} onClick={() => setDescriptions((d) => !d)} className={toolbarButtonClass(descriptions, "sm:ml-auto")} data-testid="lookup-descriptions">
            Descriptions
            <span className="sr-only">{descriptions ? ": shown" : ": hidden"}</span>
          </button>
        ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-testid="lookup-status">
        {loading}
      </p>
      {shown ? (
        <section aria-labelledby="lookup-champion" aria-busy={pending || undefined} className={cn("@container/panel panel-depth overflow-hidden rounded-panel border border-border bg-surface transition-opacity", pending && "pointer-events-none opacity-60")} inert={pending || undefined} data-testid="lookup-panel" data-champion={shown.id}>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border px-3 py-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden className="shrink-0">
                <ChampionPortrait champion={{ id: shown.id, name: shown.name, portraitUrl: shown.portrait }} size="lg" className="max-sm:h-12 max-sm:w-12" />
              </span>
              <div className="min-w-0">
                <h2 id="lookup-champion" className="text-xl font-semibold leading-tight text-fg" data-testid="lookup-name">
                  {shown.name}
                </h2>
                <p className="text-sm text-fg-muted first-letter:uppercase">{shown.title}</p>
              </div>
              {pending ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-fg-subtle" aria-hidden /> : null}
            </div>
            {lookup?.abilities ? <HasteChoice haste={haste} onChange={setHaste} /> : null}
          </div>
          {lookup?.abilities ? (
            <AbilityList abilities={lookup.abilities} haste={haste} descriptions={descriptions} />
          ) : lookup ? (
            <p className="px-3 py-4 text-sm text-fg-muted sm:px-4" data-testid="lookup-no-abilities">
              {lookup.unreadable ? `Riot's ability data for ${lookup.champion.name} could not be read.` : `${lookup.champion.name}'s abilities aren't stored yet: they arrive with the next game-data update.`}
            </p>
          ) : null}
          {lookup?.abilities ? (
            <p className="border-t border-border px-3 py-2 text-xs text-fg-subtle sm:px-4" data-testid="lookup-rule">
              {HASTE_RULE_WORDS}
            </p>
          ) : null}
        </section>
      ) : (
        <section aria-labelledby="lookup-choose" className="rounded-panel border border-dashed border-border-strong px-4 py-5" data-testid="lookup-empty">
          <h2 id="lookup-choose" className="text-base font-semibold text-fg">
            Choose a champion
          </h2>
          <p className="mt-1 text-sm text-fg-muted">Search above, or open All champions, to see its abilities and cooldowns.</p>
          {recentChoices.length ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Looked up lately" data-testid="lookup-recent">
              {recentChoices.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => go(c.id)} className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface py-1 pl-1 pr-3 text-sm font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg" data-champion={c.id}>
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
      {browsing ? (
        <ChampionPickerWindow
          champions={champions}
          selected={current}
          recent={recentChoices}
          onPick={go}
          onClose={() => {
            setBrowsing(false);
            browseRef.current?.focus({ preventScroll: true });
          }}
        />
      ) : null}
    </div>
  );
}
