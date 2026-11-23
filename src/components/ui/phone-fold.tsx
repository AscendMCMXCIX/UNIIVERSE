"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { PHONE_FOLD_ONLY } from "./phone-fold-classes";


/*
  A Fold for touch phones only (docs/DESIGN_SYSTEM.md §7, "Fold"): a long section shows its heading
  and its key figure, and the rest is one tap away behind Show. Tablets and desktop see the whole
  section and no button. The posture is the one preview rule's (posture.ts, WINDOW_POSTURE_QUERY:
  under 48rem wide, or 30rem tall or less), applied in CSS (PHONE_FOLDED, PHONE_FOLD_ONLY), so the
  server's HTML is already folded on a phone: nothing moves when the page hydrates.

  The section that folds is the group: it carries data-fold="closed" or "open" (phoneFoldProps).
  Its parts that fold take PHONE_FOLDED; its button is PhoneFoldToggle.
*/

/** The Folds opened on this history entry (history.state, kept with Next's own entries). */
function foldsOfEntry(): Record<string, boolean> {
  const state = window.history.state as { uniiverseFolds?: Record<string, boolean> } | null;
  return state?.uniiverseFolds ?? {};
}

const listeners = new Set<() => void>();

function keepOnEntry(key: string, open: boolean) {
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  window.history.replaceState({ ...state, uniiverseFolds: { ...foldsOfEntry(), [key]: open } }, "", window.location.href);
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("popstate", onChange);
  };
}

const closedOnServer = () => false;

/**
 * A phone Fold's open state, and the props its section (the group) carries. With a `key`, the state
 * is kept on the history entry, so Back (or a reload) to the page reopens what was open as it
 * hydrates, and the reader lands where they were rather than above a folded section.
 */
export function usePhoneFold(key?: string) {
  const [local, setLocal] = React.useState(false);
  const kept = React.useSyncExternalStore(subscribe, () => (key ? !!foldsOfEntry()[key] : false), closedOnServer);
  // The component's own state as well: a navigation that replaces the entry (a filter, a queue
  // switch) writes Next's state over the kept one, and the Fold stays as the reader left it.
  const open = local || kept;
  const setOpen = (next: boolean) => {
    setLocal(next);
    if (key) keepOnEntry(key, next);
  };
  return { open, toggle: () => setOpen(!open), show: () => setOpen(true), groupProps: { "data-fold": open ? "open" : "closed", className: "group/fold" } } as const;
}

const FoldContext = React.createContext<{ open: boolean; toggle: () => void } | null>(null);

/** The phone-only Show and Hide button of a section's Fold: its state from the props, or from the PhoneFoldSection around it. */
export function PhoneFoldToggle({ open: openProp, onToggle, controls, label, showText = "Show", hideText = "Hide", iconOnly = false, everywhere = false, className, testId }: { open?: boolean; /** The chevron alone (a 44px square on touch), where the words would push it onto a line of its own. */ iconOnly?: boolean; /** Shown at every width, for a part that folds at every width (FOLDED), not on phones only. */ everywhere?: boolean; onToggle?: () => void; /** The id of the part it shows. */ controls?: string; /** What it shows, for screen readers ("details of ranked progress"). */ label: string; showText?: string; hideText?: string; className?: string; testId?: string }) {
  const ctx = React.useContext(FoldContext);
  const open = openProp ?? ctx?.open ?? false;
  const toggle = onToggle ?? ctx?.toggle;
  return (
    // The wrapper holds the posture (the button's own inline-flex would outrank a hidden on it).
    <span className={cn(everywhere ? "inline-flex" : PHONE_FOLD_ONLY, "shrink-0", className)}>
      <Button size="sm" variant="ghost" className={cn(iconOnly && "max-md:min-w-11 max-md:px-0 pointer-coarse:min-w-11")} onClick={toggle} aria-expanded={open} aria-controls={controls} aria-label={`${open ? hideText : showText} ${label}`} data-testid={testId}>
        {iconOnly ? null : open ? hideText : showText}
        <ChevronDown className={cn("h-4 w-4 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </Button>
    </span>
  );
}

/** A section (server-rendered children welcome) that folds on touch phones: the group, whose PhoneFoldToggle inside it opens it. */
export function PhoneFoldSection({ children, className, ...props }: React.ComponentProps<"section">) {
  const { id } = props;
  const fold = usePhoneFold(id);
  // An address that points at the section (its #id: an old link, or one of its own switches' links)
  // opens it, so what the link is for is on screen.
  React.useEffect(() => {
    if (id && window.location.hash === `#${id}`) fold.show();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = { open: fold.open, toggle: fold.toggle };
  return (
    <FoldContext.Provider value={value}>
      <section {...props} data-fold={fold.groupProps["data-fold"]} className={cn(fold.groupProps.className, className)}>
        {children}
      </section>
    </FoldContext.Provider>
  );
}
