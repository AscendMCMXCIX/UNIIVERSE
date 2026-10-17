"use client";

import * as React from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { BACKDROP_COOKIE, BACKDROP_DEFAULT, backdropCss } from "@/lib/backdrop";
import { cn } from "@/lib/cn";

/*
  Team Overview → Appearance: one small button by the team's actions opening a popover with the
  "Background visibility" slider. The level is applied through two CSS variables (a <style> this
  component owns, so leaving the page restores the standard backdrop), and kept in a cookie for
  this browser so the page renders at the chosen level next time. Sliding re-renders only this
  component: the lineup never re-renders while the background changes.
*/

const LEVEL_NAMES: Array<[number, string]> = [
  [0, "Hidden"],
  [20, "Very subtle"],
  [40, "Balanced"],
  [65, "Clearly visible"],
  [90, "Maximum"],
];
const nameOf = (level: number) => [...LEVEL_NAMES].reverse().find(([min]) => level >= min)![1];

function store(level: number) {
  document.cookie = `${BACKDROP_COOKIE}=${level}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Shown only when the team has background artwork (there is nothing to adjust without it). */
export function BackdropControl({ initialLevel }: { initialLevel: number }) {
  const [level, setLevel] = React.useState(initialLevel);
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const slider = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  // Saved shortly after the slider stops moving (one cookie write per adjustment, not per step).
  React.useEffect(() => {
    if (level === initialLevel) return;
    const t = window.setTimeout(() => store(level), 250);
    return () => window.clearTimeout(t);
  }, [level, initialLevel]);

  React.useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => slider.current?.focus());
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape closes this popover only (nothing else on the page reacts to it).
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative" data-testid="backdrop-control">
      <style data-testid="backdrop-style">{backdropCss(level)}</style>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-md border border-border bg-bg/40 text-fg-muted transition-colors hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-accent aria-expanded:border-accent aria-expanded:text-fg motion-reduce:transition-none pointer-coarse:h-11 pointer-coarse:w-11"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Appearance"
        title="Appearance"
        data-testid="appearance-button"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div id={id} role="dialog" aria-label="Appearance" className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-border-strong bg-surface p-4 text-left shadow-2xl shadow-black/50 max-sm:left-1/2 max-sm:right-auto max-sm:-translate-x-1/2" data-testid="appearance-popover">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">Appearance</p>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <label htmlFor={`${id}-level`} className="text-sm font-medium text-fg">
              Background visibility
            </label>
            <span className="text-sm tabular-nums text-fg-muted" data-testid="backdrop-value">
              {level}%
            </span>
          </div>
          <input
            ref={slider}
            id={`${id}-level`}
            type="range"
            min={0}
            max={100}
            step={1}
            value={level}
            onChange={(e) => setLevel(Number(e.target.value))}
            aria-valuetext={`${level}%, ${nameOf(level).toLowerCase()}`}
            className={cn("mt-2 h-6 w-full cursor-pointer accent-[var(--color-accent)]")}
            data-testid="backdrop-slider"
          />
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-fg-subtle">
            <span>{nameOf(level)}</span>
            <button
              type="button"
              onClick={() => {
                setLevel(BACKDROP_DEFAULT);
                store(BACKDROP_DEFAULT);
              }}
              disabled={level === BACKDROP_DEFAULT}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-fg-muted hover:text-fg disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"
              data-testid="backdrop-reset"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Reset to default
            </button>
          </div>
          <p className="mt-3 text-xs leading-snug text-fg-subtle">How much of the team&apos;s background artwork shows on Team Overview. Only for you, on this browser.</p>
        </div>
      ) : null}
    </div>
  );
}
