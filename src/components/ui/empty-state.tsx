import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "Nothing here yet", said the same way everywhere: an icon, one sentence, why or when it fills in,
 * and the next useful step when there is one. Empty is a state of the data, not an error.
 */
export function EmptyState({ icon: Icon, title, children, action, className, testId, compact = false }: { icon?: LucideIcon; title: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode; className?: string; testId?: string; compact?: boolean }) {
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
