import * as React from "react";
import { metric, metricTooltip, type MetricKey } from "@/domain/metrics";
import { cn } from "@/lib/cn";
import { InfoTip } from "./info-tip";

/** Small ⓘ marker: hover or focus on desktop, tap on touch screens (see InfoTip). */
export function Info({ text, label, className }: { text: string; /** What it explains ("About Experience"). */ label: string; className?: string }) {
  return <InfoTip text={text} label={label} className={className} />;
}

/**
 * A labelled metric: its title (a sentence-case label in the secondary grey), the value in the main
 * text colour, its unit and an ⓘ with its one plain sentence. No box of its own: it sits in a panel
 * (25 Nov 2026: the bordered tile was a box within a box, its uppercase label a caption).
 */
export function Metric({ id, value, showUnit = true, className, valueClassName, inline = false }: { id: MetricKey; value: React.ReactNode; showUnit?: boolean; className?: string; valueClassName?: string; inline?: boolean }) {
  const m = metric(id);
  const unit = m.unit === "label" || m.unit === "count" ? null : m.unit;
  if (inline) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-fg-muted", className)}>
        <span>{m.title}</span>
        <span className={cn("font-medium text-fg", valueClassName)}>{value}</span>
        {showUnit && unit ? <span className="text-fg-muted">{unit}</span> : null}
        <Info text={metricTooltip(id)} label={`About ${m.title}`} />
      </span>
    );
  }
  return (
    <div className={cn("min-w-0", className)}>
      <div className={METRIC_LABEL}>
        {m.title} <Info text={metricTooltip(id)} label={`About ${m.title}`} />
      </div>
      <div className={cn(METRIC_VALUE, valueClassName)}>
        {value}
        {showUnit && unit ? <span className="ml-1 text-xs font-normal text-fg-muted">{unit}</span> : null}
      </div>
    </div>
  );
}

/** A metric's label and value: the label secondary, the value a primary figure (shared with a panel's hand-written metrics). */
export const METRIC_LABEL = "flex items-center gap-1 text-xs font-medium text-fg-muted";
export const METRIC_VALUE = "text-base font-semibold tabular-nums text-fg";

/** Column header or label with the metric's ⓘ. */
export function MetricLabel({ id, children, className }: { id: MetricKey; children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {children ?? metric(id).title} <Info text={metricTooltip(id)} label={`About ${metric(id).title}`} />
    </span>
  );
}
