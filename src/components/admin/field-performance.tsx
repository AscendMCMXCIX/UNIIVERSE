import { VITALS, formatVitalBound, type VitalMetric, type VitalSummary } from "@/domain/web-vitals";
import type { VitalsReport } from "@/server/observability/web-vitals";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
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

export function FieldPerformancePanel({ report }: { report: VitalsReport }) {
  const loads = report.metrics.find((m) => m.metric === "TTFB")?.all?.count ?? 0;
  return (
    <Panel data-testid="field-performance">
      <PanelHeader
        title="Page speed in members' browsers"
        subtitle={`Field data: real page loads in members' own browsers over the last ${report.days} days (since ${report.since}), not a lab test. A figure is the value 75% of loads stayed within.`}
      />
      <PanelBody className="space-y-4 text-xs">
        {loads === 0 && report.metrics.every((m) => !m.all) ? (
          <p className="text-fg-muted" data-testid="field-performance-empty">
            No measurements yet. Members&apos; browsers send them as the app is used; each browser reports the measures it supports.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-left text-fg-subtle">
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
                <tbody className="divide-y divide-border">
                  {report.metrics.map(({ metric, all, byDevice }) => (
                    <tr key={metric} data-testid={`field-metric-${metric}`}>
                      <td className="py-1 pr-3 text-fg">
                        <abbr title={VITALS[metric].label} className="no-underline">
                          {metric}
                        </abbr>
                        {CORE.includes(metric) ? null : <span className="text-fg-subtle"> (supporting)</span>}
                      </td>
                      <td className="py-1 pr-3 tabular-nums">
                        <Bound metric={metric} s={all} />
                      </td>
                      <td className="py-1 pr-3 tabular-nums text-fg-muted">{all ? pct(all.good) : "—"}</td>
                      <td className="py-1 pr-3 tabular-nums text-fg-muted">{all ? pct(all.needsImprovement) : "—"}</td>
                      <td className="py-1 pr-3 tabular-nums text-fg-muted">{all ? pct(all.poor) : "—"}</td>
                      <td className="py-1 pr-3 text-fg-muted">
                        {byDevice.length
                          ? byDevice.map(({ device, summary }) => (
                              <span key={device} className="mr-2 inline-block whitespace-nowrap">
                                {device} <Bound metric={metric} s={summary} />
                              </span>
                            ))
                          : "—"}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums text-fg-muted">{all ? formatCount(all.count) : 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.pages.length ? (
              <div>
                <SectionLabel className="mb-1">By page (where the app was opened)</SectionLabel>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="text-left text-fg-subtle">
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
                    <tbody className="divide-y divide-border">
                      {report.pages.map((p) => (
                        <tr key={p.page} data-testid={`field-page-${p.page}`}>
                          <td className="py-1 pr-3 text-fg">{p.page}</td>
                          <td className="py-1 pr-3 text-right tabular-nums text-fg-muted">{formatCount(p.loads)}</td>
                          {CORE.map((m) => (
                            <td key={m} className="py-1 pr-3 tabular-nums">
                              <Bound metric={m} s={p[m as "LCP" | "INP" | "CLS"]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </>
        )}
        <p className="text-fg-subtle">
          Good, needs work and poor follow Google&apos;s Core Web Vitals thresholds (LCP 2.5 s and 4 s, INP 200 ms and 500 ms, CLS 0.1 and 0.25). Only the page group and device class are recorded with each count: nothing identifies a member or what they opened. Browsers that do not support a measure send none for it.
        </p>
      </PanelBody>
    </Panel>
  );
}
