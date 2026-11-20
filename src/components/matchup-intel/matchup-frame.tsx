"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, BookmarkPlus, Check, Link2, LoaderCircle, Plus } from "lucide-react";
import { DUO_ROLES, ROLES, ROLE_NAMES, type ChampionChoice, type Role } from "@/domain/matchup-intel/types";
import { HASTE_CHOICES, HASTE_MAX, clampHaste } from "@/domain/matchup-intel/haste";
import { ChampionPortrait } from "@/components/champion-portrait";
import { releaseEarlyTaps, type EarlyTap } from "@/components/early-taps";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { lineupHref, matchupHref, type Lineup } from "./address";
import { RECENT_OF, slotWords, type FrameSlot } from "./slots";
import { ChampionPickerWindow } from "./champion-picker";
import { useMatchupPreferences, type PickerSlot } from "./preferences";

/*
  Matchup Intel's choice of champions (docs/MATCHUP_INTEL.md, "Where it is"): your champion and the
  enemy side by side with the swap between them, each opening its picker window, in one compact bar
  with the page's title, the patch and how fresh what follows is (`status`, built on the server) and
  the remembered line: on a desktop all of it in one row, so the dashboard under it starts high.
  A choice goes into the address (?champion=<id>&vs=<id>, the champion window's names) and the
  server builds the page for it; until it arrives the slots show the new choice, a line under them
  says what is loading, and the page under them is dimmed and out of reach (inert). Once it has
  arrived, a screen reader is told what came (the page's own sentence, `announcement`). The champion
  you play is remembered on this device and offered, never assumed: with no champion in the address
  the page offers it, and says so while it is the one shown.

  A tap on a side's slot, or on the page's prompt for it, before the page's code has run is kept
  (data-early, src/components/early-taps.ts) and opens the picker once the code runs.
*/

/** The ability haste the cooldowns are shown at (0: base only), and the way to change it, for the kit panels under the frame. */
export const HasteContext = React.createContext<{ haste: number; setHaste: (haste: number) => void }>({ haste: 0, setHaste: () => undefined });

/** The haste choice, where the enemy's kit is (its panel's header): the value lives in the frame and is remembered on this device. */
export function HasteControl() {
  const { haste, setHaste } = React.useContext(HasteContext);
  return <HasteChoice haste={haste} onChange={setHaste} />;
}

const subscribeNothing = () => () => undefined;
/** False on the server and while the page hydrates, then true: what this device remembers is known only then. */
const useOnClient = () => React.useSyncExternalStore(subscribeNothing, () => true, () => false);

/** What the page's own controls ask of the frame: a side's picker, or a pair (a curated matchup's link). */
interface FrameActions {
  openPicker: (slot: FrameSlot) => void;
  goTo: (pair: { you: string; enemy: string }) => void;
}

const FrameContext = React.createContext<FrameActions>({ openPicker: () => undefined, goTo: () => undefined });

/** Each side's kind of early tap: its slot and the page's prompt for it open the same picker. */
const EARLY: Record<PickerSlot, EarlyTap> = { you: "matchup-you", enemy: "matchup-enemy" };

/**
 * A button that opens a side's picker, for the page's own prompts ("Choose the enemy"). The picker
 * opens from that side's slot (MatchupFrame's openPicker), so focus goes back to the slot when it
 * closes: the prompt itself is gone by then, replaced by the page for the choice. Its words wrap
 * where the button is narrow (a phone at a large text size) rather than run past its edge.
 */
export function OpenPickerButton({ slot, children, testId, className }: { slot: FrameSlot; children: React.ReactNode; testId?: string; className?: string }) {
  const { openPicker } = React.useContext(FrameContext);
  return (
    <Button
      variant="primary"
      onClick={() => openPicker(slot)}
      aria-haspopup="dialog"
      // A tap before the page's code has run is kept (data-early; suppressHydrationWarning: the
      // script may have marked it pressed before React took the page over).
      data-early={slot === "you" || slot === "enemy" ? EARLY[slot] : undefined}
      suppressHydrationWarning
      data-testid={testId}
      className={cn("h-auto min-h-11 max-w-full whitespace-normal py-2 text-center", className)}
    >
      {children}
    </Button>
  );
}

/**
 * A link to a pair, for the curated matchups the page lists. It is a plain link (a new tab, or a
 * click before the page's code has run, follows it); once the code runs, a plain click goes through
 * the frame instead, as a pick does: the slots show the pair at once and the page under them dims
 * until the server's page arrives, with the focus on the enemy's slot, out of the page that dims.
 */
export function PairLink({ you, enemy, className, children, testId, current, champion }: { you: string; enemy: string; className?: string; children: React.ReactNode; testId?: string; current?: boolean; champion?: string }) {
  const { goTo } = React.useContext(FrameContext);
  return (
    <a
      href={matchupHref(you, enemy)}
      onClick={(e) => {
        // A click that asks for another tab or window is the browser's.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        goTo({ you, enemy });
      }}
      aria-current={current ? "page" : undefined}
      className={className}
      data-testid={testId}
      data-champion={champion}
    >
      {children}
    </a>
  );
}

const portraitOf = (c: ChampionChoice) => ({ id: c.id, name: c.name, portraitUrl: c.portrait });

/**
 * One side: its label, the champion's portrait and name, or the invitation to choose one. Compact,
 * so the dashboard under it starts high: on a phone a small portrait above the label and the name in
 * a narrow row (320 and 375px phones), beside them where the row has room (from 22rem), the two
 * sides mirrored around the swap; from sm (where the row is 27rem wide) the portrait beside the
 * words, as the two sides of a lane.
 */
function SlotButton({ slot, role, champion, onOpen, buttonRef }: { slot: FrameSlot; role: Role; champion: ChampionChoice | null; onOpen: () => void; buttonRef: React.Ref<HTMLButtonElement> }) {
  // Your side (you and your duo partner) on the left of the swap, mirrored; the enemies on the right.
  const you = slot === "you" || slot === "ally";
  const words = slotWords(role, slot);
  const ring = cn("ring-2", you ? "ring-blue/60" : "ring-red/60");
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      // A tap before the page's code has run is kept (data-early; suppressHydrationWarning: the
      // script may have marked it pressed before React took the page over).
      data-early={slot === "you" || slot === "enemy" ? EARLY[slot] : undefined}
      suppressHydrationWarning
      // A phone's row (max-sm:@min-[22rem]/pickers, written out whole for Tailwind to find): the
      // portrait beside the words from a row of 22rem (a 384px phone at the usual text size), with
      // a little less padding and gap, so the longest one-word name (Heimerdinger) fits whole at 384px.
      // Under it, the portrait above the words, with a narrow padding so that name fits whole down
      // to the 17.5rem where the two slots go one above the other. From sm the portrait beside the
      // words where the row is 27rem wide; a narrower one (a phone held sideways at twice the text
      // size) keeps the portrait above them, where the longest name still fits whole.
      className={cn(
        "group flex h-full w-full min-w-0 flex-col items-center justify-center gap-1 rounded-panel border bg-surface px-1 py-2 text-center transition-colors hover:border-border-strong hover:bg-surface-2/60 sm:@min-[27rem]/pickers:justify-start sm:@min-[27rem]/pickers:gap-2.5 sm:@min-[27rem]/pickers:px-3 sm:@min-[27rem]/pickers:py-1.5",
        "max-sm:@min-[22rem]/pickers:justify-start max-sm:@min-[22rem]/pickers:gap-1.5 max-sm:@min-[22rem]/pickers:px-1.5",
        you ? "max-sm:@min-[22rem]/pickers:flex-row-reverse max-sm:@min-[22rem]/pickers:text-right sm:@min-[27rem]/pickers:flex-row-reverse sm:@min-[27rem]/pickers:text-right" : "max-sm:@min-[22rem]/pickers:flex-row max-sm:@min-[22rem]/pickers:text-left sm:@min-[27rem]/pickers:flex-row sm:@min-[27rem]/pickers:text-left",
        champion ? "border-border" : "border-dashed border-border-strong",
      )}
      data-testid={`matchup-pick-${slot}`}
      data-champion={champion?.id}
    >
      <span aria-hidden className="shrink-0">
        {champion ? (
          <>
            <ChampionPortrait champion={portraitOf(champion)} size="sm" className={ring} />
          </>
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-md border border-dashed border-border-strong text-fg-subtle group-hover:text-fg">
            <Plus className="h-5 w-5" />
          </span>
        )}
      </span>
      <span className="min-w-0 max-w-full">
        {/* A label a size smaller on a phone; in the narrowest row (a 320px phone) "Your champion" shows as
            "You", as the enemy's is one word, and a screen reader still hears the whole label. */}
        <span className={cn("block text-xs font-semibold uppercase leading-tight tracking-label max-sm:text-2xs", you ? "text-blue" : "text-red")} data-testid={`matchup-pick-${slot}-label`}>
          {words.label === "Your champion" ? (
            <>
              <span aria-hidden className="hidden @max-[20rem]/pickers:inline">
                You
              </span>
              <span className="@max-[20rem]/pickers:sr-only">{words.label}</span>
            </>
          ) : (
            words.label
          )}
        </span>
        <span className="line-clamp-2 text-md font-semibold leading-snug text-fg [overflow-wrap:anywhere] max-sm:@min-[22rem]/pickers:text-sm max-sm:@min-[22rem]/pickers:tracking-tight sm:@min-[27rem]/pickers:text-base" data-testid={`matchup-pick-${slot}-name`}>
          {champion ? champion.name : words.choose}
        </span>
        {champion ? <span className="sr-only">, change</span> : null}
      </span>
    </button>
  );
}

/** Words a phone leaves out of sight to keep the line on one row; screen readers still read them (and the button names keep their visible words first). */
const WIDER = "max-sm:sr-only";
/**
 * A button whose words a larger text size makes wider than the line (Remember Mordekaiser at 200%, on
 * a phone or beside a tablet's open sidebar): they wrap and it grows. At the usual size it keeps its
 * height, 28px with a mouse and 44px on a phone or a touch screen (Button's own minimums stay).
 */
const WRAP_WORDS = "h-auto min-h-7 max-w-full whitespace-normal py-1 text-center";
/** Longer than a window's closing motion (DetailModal's EXIT_MS, 140 ms): the page under it is in a screen reader's reach again by then. */
const STATUS_SETTLE_MS = 200;

/**
 * What this device remembers as your champion, said where it matters: with no champion of yours in
 * the address, the remembered one is offered (Use, or Forget); with one, whether it is the one
 * remembered, and a way to remember it instead. Before the page has read this device's storage
 * (the server's copy, and while it hydrates) the line keeps its height and says nothing, so it never
 * shows a state this device does not have.
 *
 * Every state is one row of 44px from 320px wide (for most names; a long one may wrap), the height
 * kept while the storage is unknown, so nothing under the line moves once it is read: the picture
 * or check and the words are one item, and only the buttons may go to a row of their own. From sm
 * the buttons follow the words, not the far end of the line. A button's words, those a phone hides
 * included, are one run of text, so its gap never falls inside them. With a larger text size a
 * button wraps its words and grows (Remember Mordekaiser at 200% is wider than a 320px or 375px
 * phone), so the line never reaches past its place. Focus never falls off the page:
 * Forget and Remember are one button whose words change, and where the focused control goes with
 * what it did (Use, and Forget on the offer), focus moves to the You slot.
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
          <span>
            Use<span className={WIDER}> {remembered.name}</span>
          </span>
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
      // A button that looks like one, on a phone too, with what it does in its icon.
      <Button key="toggle" size="sm" variant="outline" className={WRAP_WORDS} onClick={() => onRemember(you.id)} data-testid="matchup-remember">
        <BookmarkPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Remember {you.name}
          <span className={WIDER}>{remembered ? " instead" : " on this device"}</span>
        </span>
      </Button>
    );
  }
  return (
    // On a desktop it sits under the status at the bar's right end, its buttons 28px with a mouse.
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted @min-[44rem]/pickers:min-h-7 @min-[44rem]/pickers:justify-end @min-[44rem]/pickers:text-xs" data-testid="matchup-remembered" data-state={state}>
      {info ? <span className="flex min-w-0 grow basis-24 items-center gap-2 sm:grow-0 sm:basis-auto">{info}</span> : null}
      {actions ? <span className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</span> : null}
    </div>
  );
}

/** "Riven vs Mordekaiser", "Jinx and Lulu vs Caitlyn and Lux", "Riven": a lineup as the loading line and the announcements name it. */
function pairWords(l: Lineup, name: (id: string | null) => string | null): string {
  const side = (a: string | null, b: string | null) => [name(a), name(b)].filter((x): x is string => !!x).join(" and ") || null;
  const you = side(l.you, l.ally);
  const enemy = side(l.enemy, l.enemy2);
  return you && enemy ? `${you} vs ${enemy}` : (you ?? enemy ?? "Matchup Intel");
}

/**
 * The lane the page is set for: Top, Jungle, Mid, ADC, Support, as one row of buttons (the pressed
 * one is the page's). Top, Jungle and Mid set you against one enemy; ADC and Support set your duo
 * against theirs (four slots), seen from your own role.
 */
function RoleSelector({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <div role="group" aria-label="Lane" className="flex max-w-full flex-wrap rounded-md border border-border-control bg-bg-elevated max-sm:w-full sm:inline-flex" data-testid="matchup-role">
      {ROLES.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={r === role}
          onClick={() => onChange(r)}
          className={cn(
            "min-h-11 grow rounded px-2 text-xs font-semibold transition-colors pointer-fine:min-h-6 sm:grow-0 sm:px-2.5",
            r === role ? "bg-accent/15 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
          )}
          data-role={r}
        >
          {ROLE_NAMES[r]}
        </button>
      ))}
    </div>
  );
}

/**
 * The ability haste the enemy's cooldowns are shown at: 0 (base cooldowns only), 20, 40, 60, or a
 * whole number typed up to HASTE_MAX. Remembered on this device. Never a timer: only the cooldown's
 * length at that haste, beside the base.
 */
function HasteChoice({ haste, onChange }: { haste: number; onChange: (haste: number) => void }) {
  const id = React.useId();
  const preset = (HASTE_CHOICES as readonly number[]).includes(haste);
  const [typed, setTyped] = React.useState(preset ? "" : String(haste));
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-muted" data-testid="matchup-haste" data-haste={haste}>
      <label htmlFor={id} className="whitespace-nowrap">
        At haste
      </label>
      <div role="group" aria-label="Ability haste" className="inline-flex max-w-full flex-wrap rounded-md border border-border-control bg-bg-elevated p-0.5">
        {HASTE_CHOICES.map((h) => (
          <button
            key={h}
            type="button"
            aria-pressed={h === haste}
            onClick={() => {
              setTyped("");
              onChange(h);
            }}
            className={cn("min-h-11 min-w-8 rounded px-1.5 font-semibold tabular-nums transition-colors pointer-fine:min-h-6", h === haste ? "bg-accent/15 text-fg" : "hover:bg-surface-2 hover:text-fg")}
            data-haste={h}
          >
            {h}
          </button>
        ))}
      </div>
      <input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        placeholder="Other"
        aria-label={`Other ability haste, 0 to ${HASTE_MAX}`}
        value={typed}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, "");
          setTyped(v);
          onChange(clampHaste(v));
        }}
        // 16px on a phone, so it never zooms in.
        className="h-11 w-14 rounded-md border border-border-control bg-bg-elevated px-2 text-base text-fg tabular-nums placeholder:text-fg-subtle pointer-fine:h-6 sm:pointer-fine:text-xs"
        data-testid="matchup-haste-input"
      />
    </div>
  );
}

/**
 * "Copy link": the page's address, which carries the role and the champions, so a reload and a
 * shared link open the same lineup (for signed-in members only). The installed app has no address
 * bar, so this is its way to share; a phone with a share sheet (Web Share) opens it instead.
 */
function CopyLink({ href }: { href: string }) {
  const [done, setDone] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    const url = new URL(href, window.location.origin).toString();
    const nav = window.navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    try {
      if (nav.share && window.matchMedia("(pointer: coarse)").matches) {
        await nav.share({ title: "Matchup Intel", url });
        return;
      }
      await nav.clipboard.writeText(url);
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 2000);
    } catch {
      // A share sheet closed without sharing, or no clipboard: nothing changes.
    }
  };
  return (
    // An icon button at the title's row end (its name and tooltip say what it does); on a touch screen its
    // 44px area overhangs the row by 6px each way, so the row is only as tall as the title.
    <Button size="sm" variant="ghost" onClick={copy} aria-label={done ? "Link copied" : "Copy link to this matchup"} title={done ? "Link copied" : "Copy link"} data-testid="matchup-copy-link" className="-my-1.5 min-h-11 min-w-11 px-0 pointer-fine:my-0 pointer-fine:min-h-7 pointer-fine:min-w-7">
      {done ? <Check className="h-4 w-4 text-good" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
    </Button>
  );
}

/**
 * On a phone, once the slots have scrolled away: a bar pinned to the top with the champions as
 * 40px portraits and the swap, so a champion is changed in two taps (its portrait, then the pick)
 * with no scroll back up. Hidden wherever the slots are in view, and on wider screens.
 */
function PinnedPairBar({ lineup, choice, onOpen, onSwap, watch }: { lineup: Lineup; choice: (id: string | null) => ChampionChoice | null; onOpen: (slot: FrameSlot, opener: HTMLElement) => void; onSwap: () => void; watch: React.RefObject<HTMLElement | null> }) {
  const [shown, setShown] = React.useState(false);
  // Just under the phone's top bar while it shows, at the very top while it hides on the way down.
  const [top, setTop] = React.useState(0);
  React.useEffect(() => {
    const el = watch.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setShown(!!entry && !entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);
  React.useEffect(() => {
    if (!shown) return;
    const bar = document.querySelector<HTMLElement>("[data-testid='mobile-topbar']");
    let frame = 0;
    const place = () => {
      frame = 0;
      setTop(bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0);
    };
    const later = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };
    place();
    window.addEventListener("scroll", later, { passive: true });
    // The top bar slides away and back (a transition): follow it to its end.
    bar?.addEventListener("transitionend", later);
    bar?.addEventListener("transitionrun", later);
    const timer = window.setInterval(later, 250);
    return () => {
      window.removeEventListener("scroll", later);
      bar?.removeEventListener("transitionend", later);
      bar?.removeEventListener("transitionrun", later);
      window.clearInterval(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [shown]);
  const duo = DUO_ROLES.has(lineup.role);
  const slots: FrameSlot[][] = [duo ? ["you", "ally"] : ["you"], duo ? ["enemy", "enemy2"] : ["enemy"]];
  const tile = (slot: FrameSlot) => {
    const c = choice(lineup[slot]);
    const words = slotWords(lineup.role, slot);
    const mine = slot === "you" || slot === "ally";
    return (
      <button key={slot} type="button" onClick={(e) => onOpen(slot, e.currentTarget)} aria-label={c ? `${words.label}: ${c.name}, change` : words.choose} className="grid h-11 w-11 place-items-center rounded-md" data-testid={`matchup-bar-${slot}`}>
        {c ? <ChampionPortrait champion={portraitOf(c)} size="sm" className={cn("h-10 w-10 ring-2", mine ? "ring-blue/60" : "ring-red/60")} /> : <span className="grid h-10 w-10 place-items-center rounded-md border border-dashed border-border-strong text-fg-subtle"><Plus className="h-4 w-4" aria-hidden /></span>}
      </button>
    );
  };
  return (
    <div className={cn("fixed inset-x-0 top-0 z-30 border-b border-border bg-bg/95 px-4 py-1 backdrop-blur sm:hidden", shown ? "flex" : "hidden")} style={{ top }} data-testid="matchup-pair-bar" aria-label="Champions chosen, pinned" role="region">
      <div className="mx-auto flex items-center gap-2">
        {slots[0]!.map(tile)}
        <button type="button" onClick={onSwap} className="grid h-11 w-11 place-items-center rounded-full text-fg-muted" aria-label="Swap your side and the enemy's" data-testid="matchup-bar-swap">
          <ArrowLeftRight className="h-5 w-5" aria-hidden />
        </button>
        {slots[1]!.map(tile)}
      </div>
    </div>
  );
}

export function MatchupFrame({
  role = "top",
  roleInAddress = true,
  you,
  enemy,
  ally = null,
  enemy2 = null,
  champions,
  curated,
  announcement = "",
  heading,
  patchState,
  children,
}: {
  /** The lane the page is set for (Top when none is given). */
  role?: Role;
  /** Whether the address named the role: an old ?champion=&vs= link opens in the lane this device last used. */
  roleInAddress?: boolean;
  you: ChampionChoice | null;
  enemy: ChampionChoice | null;
  ally?: ChampionChoice | null;
  enemy2?: ChampionChoice | null;
  champions: ChampionChoice[];
  curated: Record<string, string[]>;
  /** What a screen reader is told once the page for a choice made here has arrived ("Riven vs Mordekaiser: curated briefing, checked on patch 26.22."). */
  announcement?: string;
  /** The page's title (its h1), at the bar's start on a desktop, above it on a phone. */
  heading?: React.ReactNode;
  /** The patch and how fresh what follows is, at the bar's end (built on the server: MatchupStatus). */
  patchState?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  // The choice on its way: shown in the slots until the server's page for it arrives.
  const [target, setTarget] = React.useState<Lineup | null>(null);
  const [picking, setPicking] = React.useState<FrameSlot | null>(null);
  /**
   * The status line's words while a picker window is open, and for a moment after it has gone: the
   * page under a modal window is out of a screen reader's reach (inert), and a live region speaks
   * only what is added to it once it is in reach again, never what it already holds. So the line
   * keeps what it said until the page is back, then says what is new: what is loading, or what came.
   * A window closed without a pick changes nothing, so nothing is said.
   */
  const [heldStatus, setHeldStatus] = React.useState<string | null>(null);
  const statusNow = React.useRef("");
  const releaseTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(releaseTimer.current), []);
  const slotRefs = {
    you: React.useRef<HTMLButtonElement>(null),
    ally: React.useRef<HTMLButtonElement>(null),
    enemy: React.useRef<HTMLButtonElement>(null),
    enemy2: React.useRef<HTMLButtonElement>(null),
  };
  const slotsRef = React.useRef<HTMLDivElement>(null);
  /**
   * Opens a side's picker from its slot: the slot takes the focus first, so the picker (which hands
   * focus back to what had it when it opened) returns it to the slot, which stays on the page. A
   * prompt that asked for the picker is gone by then, and Safari never focuses a clicked button.
   */
  const openPicker = React.useCallback((slot: FrameSlot, opener?: HTMLElement) => {
    // From the pinned pair bar, its own button keeps the focus (it is on the screen; the slot is scrolled away).
    (opener ?? slotRefs[slot].current)?.focus({ preventScroll: true });
    window.clearTimeout(releaseTimer.current);
    setHeldStatus((held) => held ?? statusNow.current);
    setPicking(slot);
    // The refs are stable: read when called.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const closePicker = React.useCallback(() => {
    setPicking(null);
    window.clearTimeout(releaseTimer.current);
    releaseTimer.current = window.setTimeout(() => setHeldStatus(null), STATUS_SETTLE_MS);
  }, []);
  const focusYourSlot = React.useCallback(() => slotRefs.you.current?.focus({ preventScroll: true }), [slotRefs.you]);
  // Taps on the slots and the prompts made before this code ran: each opens its picker now, once.
  React.useEffect(() => releaseEarlyTaps("matchup-you", "matchup-enemy"), []);
  const { prefs, choose, remember, set } = useMatchupPreferences();
  const onClient = useOnClient();
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const choice = (id: string | null) => (id ? (byId.get(id) ?? null) : null);
  const current: Lineup = { role, you: you?.id ?? null, enemy: enemy?.id ?? null, ally: ally?.id ?? null, enemy2: enemy2?.id ?? null };
  const shown: Lineup = pending && target ? target : current;
  const same = (a: Lineup, b: Lineup) => a.role === b.role && a.you === b.you && a.enemy === b.enemy && a.ally === b.ally && a.enemy2 === b.enemy2;
  // The page for a choice made here has arrived (a pair reached by the browser's Back is not one).
  const arrived = !pending && !!target && same(target, current);
  const nameOf = (id: string | null) => choice(id)?.name ?? null;
  const duo = DUO_ROLES.has(shown.role);

  const go = (next: Lineup) => {
    const tidy: Lineup = DUO_ROLES.has(next.role) ? next : { ...next, ally: null, enemy2: null };
    if (same(tidy, shown)) return;
    setTarget(tidy);
    // The lineup is the page's state, like a filter: it replaces the entry, so Back leaves Matchup
    // Intel in one step however many champions were changed ("Recent" returns to an earlier pair).
    startTransition(() => router.replace(lineupHref(tidy), { scroll: false }));
  };
  const goRef = React.useRef(go);
  React.useEffect(() => {
    goRef.current = go;
  });
  // An old ?champion=&vs= link (no role) opens in the lane this device last used, once its storage is read.
  const rememberedRole = prefs.role;
  React.useEffect(() => {
    if (!roleInAddress && onClient && rememberedRole && rememberedRole !== role) goRef.current({ ...current, role: rememberedRole });
    // Once, when this device's lane is first known for a role-less address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleInAddress, onClient, rememberedRole]);
  // A curated pair's link, from the page under the slots, which dims and goes out of reach: the
  // enemy's slot takes the focus first, as a pick leaves it there.
  const goTo = React.useCallback((pair: { you: string; enemy: string }) => {
    slotRefs.enemy.current?.focus({ preventScroll: true });
    goRef.current({ ...current, ...pair });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, you?.id, enemy?.id, ally?.id, enemy2?.id]);
  const actions = React.useMemo(() => ({ openPicker, goTo }), [openPicker, goTo]);
  const pick = (slot: FrameSlot, id: string) => {
    // Your own slot is remembered as your champion; your duo partner's is not.
    if (slot === "you" || slot === "enemy") choose(slot, id);
    go({ ...shown, [slot]: id });
  };
  const swap = () => go({ ...shown, you: shown.enemy, enemy: shown.you, ally: shown.enemy2, enemy2: shown.ally });
  const changeRole = (r: Role) => {
    set({ role: r });
    go({ ...shown, role: r });
  };
  const haste = onClient ? prefs.haste : 0;
  const hasteValue = React.useMemo(() => ({ haste, setHaste: (h: number) => set({ haste: h }) }), [haste, set]);
  const recent = (slot: FrameSlot) => prefs.recent[RECENT_OF[slot]].map(choice).filter((c): c is ChampionChoice => !!c);
  const yourChoice = choice(shown.you);
  const loading = pending && target ? `Loading ${pairWords(target, nameOf)}…` : null;
  const status = loading ?? (arrived ? announcement : "");
  React.useEffect(() => {
    statusNow.current = status;
  });
  const slotButton = (slot: FrameSlot) => <SlotButton slot={slot} role={shown.role} champion={choice(shown[slot])} onOpen={() => openPicker(slot)} buttonRef={slotRefs[slot]} />;
  const pickerWords = picking ? slotWords(shown.role, picking) : null;

  return (
    <FrameContext.Provider value={actions}>
      <HasteContext.Provider value={hasteValue}>
        <div className="space-y-3">
          <section aria-label="Champions" className="@container/pickers">
            {/* One row on a desktop (from a bar of 44rem): the title and the lane, the slots with the
                swap, then the status, the haste and the remembered line at the far end. On a phone,
                one under the other. */}
            <div className={cn("grid gap-x-4 gap-y-1.5 @min-[44rem]/pickers:items-center", duo ? "@min-[44rem]/pickers:grid-cols-[minmax(0,44rem)_minmax(0,1fr)] @min-[72rem]/pickers:grid-cols-[auto_minmax(0,44rem)_minmax(0,1fr)]" : "@min-[44rem]/pickers:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] @min-[60rem]/pickers:grid-cols-[auto_minmax(0,34rem)_minmax(0,1fr)]")}>
              <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 @min-[44rem]/pickers:col-span-2", duo ? "@min-[72rem]/pickers:col-span-1 @min-[72rem]/pickers:block @min-[72rem]/pickers:space-y-0.5" : "@min-[60rem]/pickers:col-span-1 @min-[60rem]/pickers:block @min-[60rem]/pickers:space-y-0.5")} data-testid="matchup-heading">
                {/* The title with "Copy link" at its row's end; under them the lane, one row (a phone's full width). */}
                <div className="flex min-w-0 items-center justify-between gap-2 max-sm:w-full">
                  {heading}
                  <CopyLink href={lineupHref(shown)} />
                </div>
                <RoleSelector role={shown.role} onChange={changeRole} />
              </div>
              {/* Side by side, or one above the other with the swap between them where the row is under
                  17.5rem: a phone at a large text size (200%; 150% on a 393px phone; 125% up to 375px
                  wide), where side by side the longest one-word name (Heimerdinger, 6.2rem at text-md)
                  would no longer fit a slot whole. The two sides are as tall as each other (stretched),
                  whichever name wraps. In the bot lane each side holds two slots, the role's own first. */}
              <div ref={slotsRef} className="grid grid-cols-1 items-stretch gap-2 @min-[17.5rem]/pickers:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3" data-testid="matchup-pickers" data-slots={duo ? 4 : 2}>
                {duo ? (
                  <div className="grid grid-cols-2 gap-1.5" data-testid="matchup-side-you">
                    {slotButton("ally")}
                    {slotButton("you")}
                  </div>
                ) : (
                  slotButton("you")
                )}
                <button
                  type="button"
                  onClick={swap}
                  disabled={!shown.you && !shown.enemy && !shown.ally && !shown.enemy2}
                  className="grid h-11 w-11 place-items-center self-center justify-self-center rounded-full border border-border-control bg-bg-elevated text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 @min-[44rem]/pickers:pointer-fine:h-9 @min-[44rem]/pickers:pointer-fine:w-9"
                  aria-label={duo ? "Swap your duo and the enemy's" : "Swap your champion and the enemy"}
                  title="Swap"
                  data-testid="matchup-swap"
                >
                  <ArrowLeftRight className="h-5 w-5 @max-[17.5rem]/pickers:rotate-90" aria-hidden />
                </button>
                {duo ? (
                  <div className="grid grid-cols-2 gap-1.5" data-testid="matchup-side-enemy">
                    {slotButton("enemy")}
                    {slotButton("enemy2")}
                  </div>
                ) : (
                  slotButton("enemy")
                )}
              </div>
              <div className="min-w-0 space-y-0.5">
                {patchState ? <div className="@min-[44rem]/pickers:flex @min-[44rem]/pickers:justify-end">{patchState}</div> : null}
                {/* While a choice loads, what is loading takes the remembered line's place, at its height. */}
                {loading ? (
                  <p className="flex min-h-11 items-center gap-2 text-sm text-fg-muted @min-[44rem]/pickers:min-h-7 @min-[44rem]/pickers:justify-end @min-[44rem]/pickers:text-xs" aria-hidden data-testid="matchup-loading">
                    <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-accent motion-reduce:animate-none" />
                    <span className="min-w-0">{loading}</span>
                  </p>
                ) : (
                  <RememberedLine you={yourChoice} remembered={choice(prefs.you)} onUse={(id) => go({ ...shown, you: id })} onRemember={remember} focusYourSlot={focusYourSlot} />
                )}
              </div>
            </div>
            {/* Always there, so a screen reader hears each change: what is loading, then what came. */}
            <p role="status" className="sr-only" data-testid="matchup-status">
              {heldStatus ?? status}
            </p>
          </section>
          <PinnedPairBar lineup={shown} choice={choice} onOpen={openPicker} onSwap={swap} watch={slotsRef} />
          <div className={cn("transition-opacity duration-150 motion-reduce:transition-none", pending && "pointer-events-none opacity-60")} aria-busy={pending || undefined} inert={pending || undefined} data-testid="matchup-intel-content">
            {children}
          </div>
        </div>
        {picking && pickerWords ? (
          <ChampionPickerWindow
            slot={RECENT_OF[picking]}
            title={pickerWords.picker}
            description={pickerWords.description}
            champions={champions}
            selected={shown[picking]}
            recent={recent(picking)}
            curated={picking === "enemy" && shown.you && !duo ? (curated[shown.you] ?? []).map(choice).filter((c): c is ChampionChoice => !!c) : []}
            yourName={yourChoice?.name ?? null}
            onPick={(id) => pick(picking, id)}
            onClose={closePicker}
          />
        ) : null}
      </HasteContext.Provider>
    </FrameContext.Provider>
  );
}
