import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { ROW_PAD_X } from "@/components/ui/data-list";

/**
 * "Nothing here yet", said the same way everywhere: an icon, one sentence, why or when it fills in,
 * and the next useful step when there is one. Empty is a state of the data, not an error.
 * Variants:
 *   block   (the default) a dashed panel of its own, centred; `compact` for less padding;
 *   inline  one line of running text, a <p> (so `children` and `action` must be phrasing content);
 *   row     a row of a DataList, in place of a group of rows (Recent form with no full window yet).
 */
export function EmptyState({ icon: Icon, title, children, action, className, testId, compact = false, variant = "block" }: { icon?: LucideIcon; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string; testId?: string; compact?: boolean; variant?: "block" | "inline" | "row" }) {
  if (variant === "inline") {
    return (
      <p className={cn("text-sm text-fg-muted", className)} data-testid={testId}>
        {Icon ? <Icon className="mr-1.5 inline-block h-4 w-4 align-[-0.125em] text-fg-subtle" aria-hidden /> : null}
        <span className="font-medium text-fg">{title}</span>
        {children ? <> {children}</> : null}
        {action ? <> {action}</> : null}
      </p>
    );
  }
  if (variant === "row") {
    return (
      <div className={cn("flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm text-fg-muted", ROW_PAD_X, className)} data-testid={testId}>
        {Icon ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-subtle">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
        <p className="min-w-0 flex-1">
          <span className="font-medium text-fg">{title}</span>
          {children ? <> {children}</> : null}
        </p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-panel border border-dashed border-border bg-surface/40 text-center", compact ? "px-4 py-5" : "px-6 py-10", className)} data-testid={testId}>
      {Icon ? (
        <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-fg-subtle">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      ) : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {children ? <div className="max-w-md text-sm text-fg-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
