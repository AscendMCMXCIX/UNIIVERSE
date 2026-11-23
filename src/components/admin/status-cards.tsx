import { AlertTriangle, CheckCircle2, CircleDashed, Clock, RefreshCw, type LucideIcon } from "lucide-react";
import type { HealthLabel } from "@/domain/data-health";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const LOOK: Record<HealthLabel, { icon: LucideIcon; tone: BadgeTone }> = {
  Healthy: { icon: CheckCircle2, tone: "good" },
  Updating: { icon: RefreshCw, tone: "info" },
  Delayed: { icon: Clock, tone: "warn" },
  Unavailable: { icon: CircleDashed, tone: "neutral" },
  "Needs attention": { icon: AlertTriangle, tone: "bad" },
};

export interface StatusCardItem {
  key: string;
  title: string;
  label: HealthLabel;
  detail: string;
}

/**
 * Plain statuses as neutral rows (the overhaul's S9c, replacing five tinted cards): the area or
 * question and its state chip on one line, one sentence of evidence under it. About 56px a row on
 * phones; only the chip carries colour, with its icon and word, never colour alone.
 */
export function StatusCards({ items, testId }: { items: StatusCardItem[]; testId?: string }) {
  return (
    <ul className="panel-depth divide-y divide-border rounded-panel border border-border bg-surface" data-testid={testId}>
      {items.map((i) => {
        const look = LOOK[i.label];
        const Icon = look.icon;
        return (
          <li key={i.key} className="min-w-0 px-4 py-2.5" data-status={i.key} data-label={i.label}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <span className="min-w-0 text-sm font-medium text-fg [overflow-wrap:anywhere]">{i.title}</span>
              <Badge tone={look.tone} className="shrink-0">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> {i.label}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm text-fg-muted [overflow-wrap:anywhere]">{i.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}
