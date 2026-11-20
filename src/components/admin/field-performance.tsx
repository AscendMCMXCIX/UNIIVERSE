import { VITALS, formatVitalBound, type VitalMetric, type VitalSummary } from "@/domain/web-vitals";
import type { VitalsReport } from "@/server/observability/web-vitals";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { formatCount } from "@/lib/format";

/*
  Admin Mode → System Health: page speed as members experienced it (field data, server/observability/
  web-vitals). The lab figures (Lighthouse on one emulated phone) are in docs/PERFORMANCE.md and are
  never mixed in here. Each figure says how many measurements stand behind it.
*/

const CORE: VitalMetric[] = ["LCP", "INP", "CLS"];
const pct = (share: number) => `${Math.round(share * 100)}%`;

function Bound({ metric, s }: { metric: VitalMetric; s: VitalSummary | null }) {
  if (!s) return <span className="text-fg-subtle">—</span>;
  const tone = s.p75AtMost !== null && s.p75AtMost <= VITALS[metric].good ? "text-good" : s.p75AtMost !== null && s.p75AtMost <= VITALS[metric].poor ? "text-warn" : "text-bad";
  return <span className={tone}>{formatVitalBound(metric, s.p75AtMost)}</span>;
}

/** What each core measure means, in words. */
/*
  What each core measure means, in words. A figure is the bound 75% of loads stayed within; past the
  last bound there is none, which only says more than a quarter of loads were slower (not that 75% were).
*/
const PLAIN: Record<"LCP" | "INP" | "CLS", { name: string; within: string; over: string }> = {
  LCP: { name: "Main content showed", within: "Within", over: "Over" },
  INP: { name: "Taps and clicks answered", within: "Within", over: "Over" },
  CLS: { name: "The page stayed still", within: "Moved at most", over: "Moved more than" },
};

function inWords(metric: "LCP" | "INP" | "CLS", s: VitalSummary): string {
  const bound = formatVitalBound(metric, s.p75AtMost).replace(/^[≤>]\s*/, "");
  const loads = `${formatCount(s.count)} ${s.count === 1 ? "load" : "loads"}`;
  return s.p75AtMost === null ? `${PLAIN[metric].over} ${bound} on more than a quarter of ${loads}` : `${PLAIN[metric].within} ${bound} on 75% of ${loads}`;
}

function verdict(metric: VitalMetric, s: VitalSummary): { word: string; tone: "good" | "warn" | "bad" } {
  if (s.p75AtMost !== null && s.p75AtMost <= VITALS[metric].good) return { word: "Good", tone: "good" };
  if (s.p75AtMost !== null && s.p75AtMost <= VITALS[metric].poor) return { word: "Needs work", tone: "warn" };
  return { word: "Poor", tone: "bad" };
}

/* A table from 640px; below it each row is a label-and-figure list (the cells' data-label), so nothing scrolls sideways. */
const TABLE = "w-full max-sm:block";
const HEAD = "text-left text-fg-subtle max-sm:sr-only";
const ROW = "max-sm:block max-sm:py-2";
const CELL = "py-1 pr-3 max-sm:flex max-sm:justify-between max-sm:gap-3 max-sm:py-0.5 max-sm:pr-0 max-sm:before:text-fg-subtle max-sm:before:content-[attr(data-label)]";

export function FieldPerformancePanel({ report }: { report: VitalsReport }) {
  const loads = report.metrics.find((m) => m.metric === "TTFB")?.all?.count ?? 0;
  const empty = loads === 0 && report.metrics.every((m) => !m.all);
  return (
    <Panel data-testid="field-performance">
      <PanelHeader title="Page speed in members' browsers" subtitle={`Real page loads over the last ${report.days} days, not a lab test.`} />
      <PanelBody className="space-y-3">
        {empty ? (
          <p className="text-sm text-fg-muted" data-testid="field-performance-empty">
            No measurements yet. Members&apos; browsers send them as the app is used; each browser reports the measures it supports.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border" data-testid="field-performance-words">
              {CORE.map((metric) => {
                const all = report.metrics.find((m) => m.metric === metric)?.all ?? null;
                const plain = PLAIN[metric as "LCP" | "INP" | "CLS"];
                const v = all ? verdict(metric, all) : null;
                return (
                  <li key={metric} className="flex min-w-0 items-start justify-between gap-3 py-2" data-testid={`field-words-${metric}`}>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-fg">{plain.name}</span>
                      <span className="block text-sm text-fg-muted">{all ? inWords(metric as "LCP" | "INP" | "CLS", all) : "Not measured yet"}</span>
                    </span>
                    {v ? <Badge tone={v.tone} className="shrink-0">{v.word}</Badge> : <Badge tone="neutral" className="shrink-0">No data</Badge>}
                  </li>
                );
              })}
            </ul>
            <Disclosure title="Technical details" description="Every measure, by device and by page." testId="field-performance-details">
              <div className="space-y-4 text-xs">
                <p className="text-fg-subtle">Since {report.since}. A figure is the value 75% of loads stayed within.</p>
                <table className={TABLE}>
                  <thead className={HEAD}>
                    <tr>
                      <th className="py-1 pr-3 font-medium">Measure</th>
                      <th className="py-1 pr-3 font-medium">75% of loads</th>
                      <th className="py-1 pr-3 font-medium">Good</th>
                      <th className="py-1 pr-3 font-medium">Needs work</th>
                      <th className="py-1 pr-3 font-medium">Poor</th>
                      <th className="py-1 pr-3 font-medium">By device</th>
                      <th className="py-1 pr-3 text-right font-medium">Measured</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border max-sm:block">
                    {report.metrics.map(({ metric, all, byDevice }) => (
                      <tr key={metric} className={ROW} data-testid={`field-metric-${metric}`}>
                        <td className="py-1 pr-3 font-medium text-fg max-sm:block max-sm:pr-0">
                          {VITALS[metric].label} ({metric}){CORE.includes(metric) ? null : <span className="font-normal text-fg-subtle"> · supporting</span>}
                        </td>
                        <td className={`${CELL} tabular-nums`} data-label="75% of loads">
                          <Bound metric={metric} s={all} />
                        </td>
                        <td className={`${CELL} tabular-nums text-fg-muted`} data-label="Good">{all ? pct(all.good) : "—"}</td>
                        <td className={`${CELL} tabular-nums text-fg-muted`} data-label="Needs work">{all ? pct(all.needsImprovement) : "—"}</td>
                        <td className={`${CELL} tabular-nums text-fg-muted`} data-label="Poor">{all ? pct(all.poor) : "—"}</td>
                        <td className={`${CELL} text-fg-muted`} data-label="By device">
                          <span>
                            {byDevice.length
                              ? byDevice.map(({ device, summary }) => (
                                  <span key={device} className="ml-2 inline-block whitespace-nowrap first:ml-0">
                                    {device} <Bound metric={metric} s={summary} />
                                  </span>
                                ))
                              : "—"}
                          </span>
                        </td>
                        <td className={`${CELL} tabular-nums text-fg-muted sm:text-right`} data-label="Measured">{all ? formatCount(all.count) : 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.pages.length ? (
                  <div>
                    <SectionLabel className="mb-1">By page (where the app was opened)</SectionLabel>
                    <table className={TABLE}>
                      <thead className={HEAD}>
                        <tr>
                          <th className="py-1 pr-3 font-medium">Page</th>
                          <th className="py-1 pr-3 text-right font-medium">Loads</th>
                          {CORE.map((m) => (
                            <th key={m} className="py-1 pr-3 font-medium">
                              {m}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border max-sm:block">
                        {report.pages.map((p) => (
                          <tr key={p.page} className={ROW} data-testid={`field-page-${p.page}`}>
                            <td className="py-1 pr-3 font-medium text-fg max-sm:block max-sm:pr-0">{p.page}</td>
                            <td className={`${CELL} tabular-nums text-fg-muted sm:text-right`} data-label="Loads">{formatCount(p.loads)}</td>
                            {CORE.map((m) => (
                              <td key={m} className={`${CELL} tabular-nums`} data-label={m}>
                                <Bound metric={m} s={p[m as "LCP" | "INP" | "CLS"]} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <p className="text-fg-subtle">
                  Good, needs work and poor follow Google&apos;s Core Web Vitals thresholds (LCP 2.5 s and 4 s, INP 200 ms and 500 ms, CLS 0.1 and 0.25). Only the page group and device class are recorded with each count: nothing identifies a member or what they opened. Browsers that do not support a measure send none for it.
                </p>
              </div>
            </Disclosure>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
