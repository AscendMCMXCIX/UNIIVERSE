import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A selectable chip (role, side, mode, series length…): the one place that defines its look and
 * its touch size. 44px tall on phones, the compact desktop height from md up.
 */
export function ToggleChip({ active, tone = "accent", size = "md", className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; tone?: "accent" | "blue" | "red"; size?: "sm" | "md" }) {
  const activeTone = { accent: "border-accent bg-accent/10 text-accent-strong", blue: "border-blue bg-blue/15 text-blue", red: "border-red bg-red/15 text-red" }[tone];
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border transition-colors disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent",
        size === "sm" ? "min-h-11 px-2.5 text-xs md:min-h-0 md:h-8" : "min-h-11 px-3 text-sm md:min-h-0 md:h-9",
        active ? activeTone : "border-border bg-bg-elevated text-fg-muted hover:text-fg",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
