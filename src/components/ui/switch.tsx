"use client";

import { cn } from "@/lib/cn";

/** An on/off switch with a visible label and an optional description; a real checkbox underneath for keyboards and screen readers. */
export function Switch({ checked, onChange, label, description, disabled, id }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string; disabled?: boolean; id: string }) {
  return (
    <label htmlFor={id} className={cn("flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-2/60 md:min-h-0", disabled && "cursor-not-allowed opacity-60")}>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-5 w-9 rounded-full border border-border-control bg-surface-3 transition-colors peer-checked:border-accent peer-checked:bg-accent/80 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent" aria-hidden />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-fg shadow transition-transform peer-checked:translate-x-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {description ? <span className="block text-xs text-fg-muted">{description}</span> : null}
      </span>
    </label>
  );
}
