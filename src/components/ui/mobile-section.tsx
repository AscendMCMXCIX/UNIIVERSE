"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Collapsible on phones and tablets, always expanded on wide screens (xl and up). The initial
 * render leaves the decision to CSS, so server and client markup match and nothing flashes.
 */
export function MobileSection({ title, defaultOpen = false, openFrom = "xl", children, className }: { title: React.ReactNode; defaultOpen?: boolean; /** Breakpoint from which the section is always expanded and the toggle disappears. */ openFrom?: "md" | "xl"; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = React.useState<boolean | null>(null);
  const shown = open ?? defaultOpen;
  const always = openFrom === "md" ? "md:block" : "xl:block";
  const toggleHidden = openFrom === "md" ? "md:hidden" : "xl:hidden";
  const noMargin = openFrom === "md" ? "md:mt-0" : "xl:mt-0";
  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen(!shown)}
        aria-expanded={shown}
        className={cn("flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-bg-elevated px-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted hover:text-fg", toggleHidden)}
      >
        <span className="truncate">{title}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", shown && "rotate-180")} />
      </button>
      <div className={cn(noMargin, shown ? "mt-2 block" : cn("hidden", always))}>{children}</div>
    </div>
  );
}
