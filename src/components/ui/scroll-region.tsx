import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * A wide table's sideways scroller. It can take keyboard focus (the arrow keys then scroll it,
 * with the usual focus ring) and is named for screen readers, so a table wider than a phone is
 * reachable without a mouse or a swipe (WCAG 2.1.1; axe `scrollable-region-focusable`).
 */
export function ScrollRegion({ label, className, children, ...rest }: { label: string; className?: string; children: React.ReactNode } & Omit<React.HTMLAttributes<HTMLDivElement>, "aria-label" | "role" | "tabIndex">) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className={cn("overflow-x-auto", className)} {...rest}>
      {children}
    </div>
  );
}
