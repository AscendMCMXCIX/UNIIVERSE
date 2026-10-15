import * as React from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "good" | "warn" | "bad" | "blue" | "red" | "info";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-fg-muted border-border",
  accent: "bg-accent/15 text-accent-strong border-accent/30",
  good: "bg-good/15 text-good border-good/30",
  warn: "bg-warn/15 text-warn border-warn/30",
  // Red text is lifted a quarter towards white: plain red on its own 15% tint is below 4.5:1 (axe).
  bad: "bg-bad/15 text-[color-mix(in_srgb,var(--color-bad)_75%,white)] border-bad/30",
  blue: "bg-blue/15 text-blue border-blue/30",
  red: "bg-red/15 text-[color-mix(in_srgb,var(--color-red)_75%,white)] border-red/30",
  info: "bg-info/15 text-info border-info/30",
};

export function Badge({ tone = "neutral", className, children, title }: { tone?: BadgeTone; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex max-w-full items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium leading-tight", tones[tone], className)}>
      {children}
    </span>
  );
}
