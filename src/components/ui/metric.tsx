import * as React from "react";
import { metric, metricTooltip, type MetricKey } from "@/domain/metrics";
import { cn } from "@/lib/cn";
import { InfoTip } from "./info-tip";

/** Small ⓘ marker: hover or focus on desktop, tap on touch screens (see InfoTip). */
export function Info({ text, label, className }: { text: string; /** What it explains ("About Experience"). */ label: string; className?: string }) {
  return <InfoTip text={text} label={label} className={className} />;
}

/** A labelled metric: title, value, unit and an ⓘ with its one plain sentence. */
export function Metric({ id, value, showUnit = true, className, valueClassName, inline = false }: { id: MetricKey; value: React.ReactNode; showUnit?: boolean; className?: string; valueClassName?: string; inline?: boolean }) {
  const m = metric(id);
  const unit = m.unit === "label" || m.unit === "count" ? null : m.unit;
  if (inline) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-fg-muted", className)}>
        <span>{m.title}</span>
        <span className={cn("font-medium text-fg", valueClassName)}>{value}</span>
        {showUnit && unit ? <span className="text-fg-subtle">{unit}</span> : null}
        <Info text={metricTooltip(id)} label={`About ${m.title}`} />
      </span>
    );
  }
  return (
    <div className={cn("rounded-md border border-border bg-bg-elevated px-2.5 py-1.5", className)}>
      <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-label text-fg-subtle">
        {m.title} <Info text={metricTooltip(id)} label={`About ${m.title}`} />
      </div>
      <div className={cn("text-sm font-semibold text-fg", valueClassName)}>
        {value}
        {showUnit && unit ? <span className="ml-1 text-xs font-normal text-fg-subtle">{unit}</span> : null}
      </div>
    </div>
  );
}

/** Column header or label with the metric's ⓘ. */
export function MetricLabel({ id, children, className }: { id: MetricKey; children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {children ?? metric(id).title} <Info text={metricTooltip(id)} label={`About ${metric(id).title}`} />
    </span>
  );
}
