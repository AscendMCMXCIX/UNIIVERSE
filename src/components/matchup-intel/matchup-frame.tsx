"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Check, Plus } from "lucide-react";
import type { ChampionChoice } from "@/domain/matchup-intel/types";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { matchupHref } from "./address";
import { ChampionPickerWindow } from "./champion-picker";
import { useMatchupPreferences, type PickerSlot } from "./preferences";

/*
  Matchup Intel's choice of champions (docs/MATCHUP_INTEL.md, "Where it is"): your champion and the
  enemy side by side, large targets with the swap between them, each opening its picker window.
  A choice goes into the address (?champion=<id>&vs=<id>, the champion window's names) and the
  server builds the page for it; until it arrives the slots show the new choice and the page under
  them is dimmed. The champion you play is remembered on this device and offered, never assumed:
  with no champion in the address the page offers it, and says so while it is the one shown.
*/

type Pair = { you: string | null; enemy: string | null };

const subscribeNothing = () => () => undefined;
/** False on the server and while the page hydrates, then true: what this device remembers is known only then. */
const useOnClient = () => React.useSyncExternalStore(subscribeNothing, () => true, () => false);

const PickerContext = React.createContext<(slot: PickerSlot) => void>(() => undefined);

/**
 * A button that opens a side's picker, for the page's own prompts ("Choose the enemy"). The picker
 * opens from that side's slot (MatchupFrame's openPicker), so focus goes back to the slot when it
 * closes: the prompt itself is gone by then, replaced by the page for the choice.
 */
export function OpenPickerButton({ slot, children, testId }: { slot: PickerSlot; children: React.ReactNode; testId?: string }) {
  const open = React.useContext(PickerContext);
  return (
    <Button variant="primary" onClick={() => open(slot)} aria-haspopup="dialog" data-testid={testId}>
      {children}
    </Button>
  );
}

const portraitOf = (c: ChampionChoice) => ({ id: c.id, name: c.name, portraitUrl: c.portrait });

/**
 * One side: its label, the champion's portrait, name and title, or the invitation to choose one.
 * Stacked and centred on a phone; from sm the two sides mirror each other, each portrait beside the
 * swap between them, as the two sides of a lane.
 */
function SlotButton({ slot, champion, onOpen, buttonRef }: { slot: PickerSlot; champion: ChampionChoice | null; onOpen: () => void; buttonRef: React.Ref<HTMLButtonElement> }) {
  const you = slot === "you";
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={cn(
        "group flex w-full min-w-0 flex-col items-center gap-2 rounded-panel border bg-surface px-2 py-3 text-center transition-colors hover:border-border-strong hover:bg-surface-2/60 sm:gap-3 sm:px-4",
        you ? "sm:flex-row-reverse sm:text-right" : "sm:flex-row sm:text-left",
        champion ? "border-border" : "border-dashed border-border-strong",
      )}
      data-testid={`matchup-pick-${slot}`}
      data-champion={champion?.id}
    >
      <span aria-hidden className="shrink-0">
        {champion ? (
          <ChampionPortrait champion={portraitOf(champion)} size="lg" className={cn("ring-2", you ? "ring-blue/60" : "ring-red/60")} />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-md border border-dashed border-border-strong text-fg-subtle group-hover:text-fg">
            <Plus className="h-6 w-6" />
          </span>
        )}
      </span>
      <span className="min-w-0 max-w-full">
        <span className={cn("block text-xs font-semibold uppercase tracking-label", you ? "text-blue" : "text-red")}>{you ? "You" : "Enemy"}</span>
        <span className="line-clamp-2 text-md font-semibold leading-snug text-fg [overflow-wrap:anywhere] sm:text-lg" data-testid={`matchup-pick-${slot}-name`}>
          {champion ? champion.name : you ? "Choose your champion" : "Choose the enemy"}
        </span>
        {champion?.title ? <span className="block truncate text-sm text-fg-muted max-sm:hidden">{champion.title}</span> : null}
        {champion ? <span className="sr-only">, change</span> : null}
      </span>
    </button>
  );
}

/** Words a phone leaves out of sight to keep the line on one row; screen readers still read them (and the button names keep their visible words first). */
const WIDER = "max-sm:sr-only";

/**
 * What this device remembers as your champion, said where it matters: with no champion of yours in
 * the address, the remembered one is offered (Use, or Forget); with one, whether it is the one
 * remembered, and a way to remember it instead. Before the page has read this device's storage
 * (the server's copy, and while it hydrates) the line keeps its height and says nothing, so it never
 * shows a state this device does not have.
 *
 * Every state is one row of 44px from 320px wide (for most names; a long one may wrap), the height
 * kept while the storage is unknown, so nothing under the line moves once it is read: the picture
 * or check and the words are one item, and only the buttons may go to a row of their own. Focus
 * never falls off the page: Forget and Remember are one button whose words change, and where the
 * focused control goes with what it did (Use, and Forget on the offer), focus moves to the You slot.
 */
function RememberedLine({ you, remembered, onUse, onRemember, focusYourSlot }: { you: ChampionChoice | null; remembered: ChampionChoice | null; onUse: (id: string) => void; onRemember: (id: string | null) => void; focusYourSlot: () => void }) {
  const onClient = useOnClient();
  let info: React.ReactNode = null;
  let actions: React.ReactNode = null;
  let state: string;
  if (!onClient) {
    // Until this device's storage has been read, the line keeps its place and claims nothing.
    state = "loading";
  } else if (!you && remembered) {
    state = "offer";
    info = (
      <>
        <span aria-hidden className="shrink-0">
          <ChampionPortrait champion={portraitOf(remembered)} size="xs" className="ring-1 ring-blue/60" />
        </span>
        <span className="min-w-0">
          Remembered<span className={WIDER}> on this device</span>: <span className="font-semibold text-fg">{remembered.name}</span>
        </span>
      </>
    );
    actions = (
      <>
        <Button
          key="use"
          size="sm"
          variant="secondary"
          onClick={() => {
            focusYourSlot();
            onUse(remembered.id);
          }}
          data-testid="matchup-use-remembered"
        >
          Use<span className={WIDER}> {remembered.name}</span>
        </Button>
        <Button
          key="toggle"
          size="sm"
          variant="ghost"
          onClick={() => {
            focusYourSlot();
            onRemember(null);
          }}
          data-testid="matchup-forget"
        >
          Forget
        </Button>
      </>
    );
  } else if (!you) {
    state = "none";
    info = <span className="min-w-0">The champion you play is remembered on this device, to offer next time.</span>;
  } else if (remembered?.id === you.id) {
    state = "remembered";
    info = (
      <>
        <Check className="h-4 w-4 shrink-0 text-good" aria-hidden />
        <span className="min-w-0">
          <span className="font-semibold text-fg">{you.name}</span> is remembered<span className={WIDER}> on this device</span> as your champion.
        </span>
      </>
    );
    actions = (
      <Button key="toggle" size="sm" variant="ghost" onClick={() => onRemember(null)} data-testid="matchup-forget">
        Forget
      </Button>
    );
  } else {
    state = "other";
    info = remembered ? (
      <span className="min-w-0">
        <span className="font-semibold text-fg">{remembered.name}</span> is remembered<span className={WIDER}> on this device</span>.
      </span>
    ) : null;
    actions = (
      <Button key="toggle" size="sm" variant="ghost" onClick={() => onRemember(you.id)} data-testid="matchup-remember">
        Remember {you.name}
        <span className={WIDER}>{remembered ? " instead" : " on this device"}</span>
      </Button>
    );
  }
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted" data-testid="matchup-remembered" data-state={state}>
      {info ? <span className="flex min-w-0 grow basis-24 items-center gap-2">{info}</span> : null}
      {actions ? <span className="flex shrink-0 items-center gap-2">{actions}</span> : null}
    </div>
  );
}

export function MatchupFrame({ you, enemy, champions, curated, children }: { you: ChampionChoice | null; enemy: ChampionChoice | null; champions: ChampionChoice[]; curated: Record<string, string[]>; children?: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  // The choice on its way: shown in the slots until the server's page for it arrives.
  const [target, setTarget] = React.useState<Pair | null>(null);
  const [picking, setPicking] = React.useState<PickerSlot | null>(null);
  const youSlot = React.useRef<HTMLButtonElement>(null);
  const enemySlot = React.useRef<HTMLButtonElement>(null);
  /**
   * Opens a side's picker from its slot: the slot takes the focus first, so the picker (which hands
   * focus back to what had it when it opened) returns it to the slot, which stays on the page. A
   * prompt that asked for the picker is gone by then, and Safari never focuses a clicked button.
   */
  const openPicker = React.useCallback((slot: PickerSlot) => {
    (slot === "you" ? youSlot : enemySlot).current?.focus({ preventScroll: true });
    setPicking(slot);
  }, []);
  const focusYourSlot = React.useCallback(() => youSlot.current?.focus({ preventScroll: true }), []);
  const { prefs, choose, remember } = useMatchupPreferences();
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const choice = (id: string | null) => (id ? (byId.get(id) ?? null) : null);
  const current: Pair = { you: you?.id ?? null, enemy: enemy?.id ?? null };
  const shown: Pair = pending && target ? target : current;

  const go = (next: Pair) => {
    if (next.you === shown.you && next.enemy === shown.enemy) return;
    setTarget(next);
    startTransition(() => router.push(matchupHref(next.you, next.enemy), { scroll: false }));
  };
  const pick = (slot: PickerSlot, id: string) => {
    choose(slot, id);
    go({ ...shown, [slot]: id });
  };
  const recent = (slot: PickerSlot) => prefs.recent[slot].map(choice).filter((c): c is ChampionChoice => !!c);
  const yourChoice = choice(shown.you);

  return (
    <PickerContext.Provider value={openPicker}>
      <div className="space-y-5">
        <section aria-label="Champions" className="@container/pickers space-y-1.5">
          {/* Side by side, or one above the other with the swap between them where the row is under
              14rem: a phone at a large text size (200%; 150% up to 375px wide), where side by side
              each slot would be narrower than its portrait and its label. */}
          <div className="grid grid-cols-1 items-center gap-2 @min-[14rem]/pickers:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3" data-testid="matchup-pickers">
            <SlotButton slot="you" champion={yourChoice} onOpen={() => openPicker("you")} buttonRef={youSlot} />
            <button
              type="button"
              onClick={() => go({ you: shown.enemy, enemy: shown.you })}
              disabled={!shown.you && !shown.enemy}
              className="grid h-11 w-11 place-items-center justify-self-center rounded-full border border-border-control bg-bg-elevated text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Swap your champion and the enemy"
              title="Swap"
              data-testid="matchup-swap"
            >
              <ArrowLeftRight className="h-5 w-5 @max-[14rem]/pickers:rotate-90" aria-hidden />
            </button>
            <SlotButton slot="enemy" champion={choice(shown.enemy)} onOpen={() => openPicker("enemy")} buttonRef={enemySlot} />
          </div>
          <RememberedLine you={yourChoice} remembered={choice(prefs.you)} onUse={(id) => go({ ...shown, you: id })} onRemember={remember} focusYourSlot={focusYourSlot} />
        </section>
        <div className={cn("transition-opacity duration-150 motion-reduce:transition-none", pending && "opacity-60")} aria-busy={pending || undefined} data-testid="matchup-intel-content">
          {children}
        </div>
      </div>
      {picking ? (
        <ChampionPickerWindow
          slot={picking}
          champions={champions}
          selected={shown[picking]}
          recent={recent(picking)}
          curated={picking === "enemy" && shown.you ? (curated[shown.you] ?? []).map(choice).filter((c): c is ChampionChoice => !!c) : []}
          yourName={yourChoice?.name ?? null}
          onPick={(id) => pick(picking, id)}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </PickerContext.Provider>
  );
}
