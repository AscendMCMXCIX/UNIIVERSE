import { AlertTriangle, CheckCircle2, CircleDashed, Clock, RefreshCw, type LucideIcon } from "lucide-react";
import type { HealthLabel } from "@/domain/data-health";
import { cn } from "@/lib/cn";

const LOOK: Record<HealthLabel, { icon: LucideIcon; text: string; border: string; bg: string }> = {
  Healthy: { icon: CheckCircle2, text: "text-good", border: "border-good/30", bg: "bg-good/5" },
  Updating: { icon: RefreshCw, text: "text-info", border: "border-info/30", bg: "bg-info/5" },
  Delayed: { icon: Clock, text: "text-warn", border: "border-warn/40", bg: "bg-warn/5" },
  Unavailable: { icon: CircleDashed, text: "text-fg-muted", border: "border-border", bg: "bg-surface" },
  "Needs attention": { icon: AlertTriangle, text: "text-bad", border: "border-bad/50", bg: "bg-bad/5" },
};

export interface StatusCardItem {
  key: string;
  title: string;
  label: HealthLabel;
  detail: string;
}

/** Plain status cards: a question or area, one label with an icon and colour, one sentence of evidence. */
export function StatusCards({ items, testId }: { items: StatusCardItem[]; testId?: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid={testId}>
      {items.map((i) => {
        const look = LOOK[i.label];
        const Icon = look.icon;
        return (
          <li key={i.key} className={cn("rounded-panel border p-4", look.border, look.bg)} data-status={i.key} data-label={i.label}>
            <div className="text-sm font-medium text-fg-muted">{i.title}</div>
            <div className={cn("mt-1 flex items-center gap-2 text-lg font-semibold", look.text)}>
              <Icon className="h-5 w-5 shrink-0" aria-hidden /> {i.label}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-fg">{i.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}
