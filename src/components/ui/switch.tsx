"use client";

import { cn } from "@/lib/cn";

/** The track and knob every switch shares: the brand blue and the knob at the right when on, a quiet track with the knob at the left when off (the knob's side says it without the colour). */
function Track() {
  return (
    <>
      <span className="h-5 w-9 rounded-full border border-border-control bg-surface-3 transition-colors peer-checked:border-accent peer-checked:bg-accent/80 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" aria-hidden />
      <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-fg shadow transition-transform peer-checked:translate-x-4 motion-reduce:transition-none" aria-hidden />
    </>
  );
}

/**
 * An on/off switch with a visible label; a real checkbox underneath (role="switch") for keyboards
 * and screen readers. The default form leads a row: the switch, its label and an optional
 * description. `inline`: a compact form for the end of a row (a field's label line), the label
 * before the switch and the whole of it one target, finger-sized on touch screens and phones.
 * `ariaLabel` names it when several switches share one visible label ("Show publicly: YouTube").
 */
export function Switch({ checked, onChange, label, description, disabled, id, inline = false, ariaLabel, className, testId }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string; disabled?: boolean; id: string; inline?: boolean; ariaLabel?: string; className?: string; testId?: string }) {
  const input = <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} aria-label={ariaLabel} onChange={(e) => onChange(e.target.checked)} />;
  if (inline)
    return (
      <label htmlFor={id} className={cn("inline-flex min-h-11 shrink-0 cursor-pointer select-none items-center gap-2 rounded-md px-1.5 text-xs font-medium transition-colors md:pointer-fine:min-h-8", checked ? "text-fg" : "text-fg-muted hover:text-fg", disabled && "cursor-not-allowed opacity-60", className)} data-testid={testId} data-state={checked ? "on" : "off"}>
        <span>{label}</span>
        <span className="relative inline-flex shrink-0">
          {input}
          <Track />
        </span>
      </label>
    );
  return (
    <label htmlFor={id} className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-2/60 md:min-h-0", disabled && "cursor-not-allowed opacity-60", className)} data-testid={testId} data-state={checked ? "on" : "off"}>
      <span className="relative mt-0.5 inline-flex shrink-0">
        {input}
        <Track />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {description ? <span className="block text-xs text-fg-muted">{description}</span> : null}
      </span>
    </label>
  );
}
