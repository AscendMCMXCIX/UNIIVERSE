import Link from "next/link";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Scale } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { TeamInsightsPageView } from "@/server/matches/team-insights-view";

/*
  Team insights: a few sentences about the team's own games, each with its records, its interval
  and its dates, or a plain "nothing stands out" when that is the answer. The full list of
  comparisons and the method are one click away, never in the way.
*/

type Row = TeamInsightsPageView["rows"][number];

const STATUS: Record<Exclude<Row["status"], "untested">, { label: string; tone: "accent" | "neutral" }> = {
  finding: { label: "Stands out", tone: "accent" },
  small: { label: "Under 5 points", tone: "neutral" },
  chance: { label: "Within chance", tone: "neutral" },
};

/** Every comparison: the checked ones with their interval and status, then the rest, compactly: those waiting for more games, and those these games cannot compare. */
function Comparisons({ rows }: { rows: readonly Row[] }) {
  const checked = rows.filter((r) => r.status !== "untested");
  const waiting = rows.filter((r) => r.status === "untested" && r.reason === "too-few-games");
  const blocked = rows.filter((r) => r.status === "untested" && r.reason !== "too-few-games");
  const description = [checked.length ? `${checked.length} checked` : null, waiting.length ? `${waiting.length} waiting for more games` : null, blocked.length ? `${blocked.length} not compared` : null].filter(Boolean).join(", ");
  return (
    <Disclosure title="Every comparison" description={description} testId="insights-all">
      {checked.length ? (
        <ul className="divide-y divide-border" aria-label="Comparisons checked" data-testid="insights-rows">
          {checked.map((r) => {
            const status = STATUS[r.status as keyof typeof STATUS];
            return (
              <li key={r.key} className="grid gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-4" data-testid="insight-row">
                <div className="min-w-0">
                  <p className="text-sm text-fg">{r.label}</p>
                  <p className="text-xs text-fg-subtle">{r.records}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="text-sm text-fg-muted">{r.result}</span>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <UncheckedList title="Waiting for more games" rows={waiting} testId="insights-waiting" />
      <UncheckedList title="Not compared" rows={blocked} testId="insights-blocked" />
    </Disclosure>
  );
}

/** A compact list of comparisons that were not checked, under a plain label (not a heading: the findings' panel owns the outline). */
function UncheckedList({ title, rows, testId }: { title: string; rows: readonly Row[]; testId: string }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-fg">{title}</p>
      <ul className="space-y-2" aria-label={title} data-testid={testId}>
        {rows.map((r) => (
          <li key={r.key} className="text-sm" data-testid="insight-unchecked">
            <span className="text-fg">{r.label}</span>
            <span className="block text-xs text-fg-subtle">
              {r.records} · {r.result}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TeamInsights({ view, preview }: { view: TeamInsightsPageView; preview: boolean }) {
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-4" data-testid="team-insights">
      <PageHeader
        title={view.title}
        description={view.scope}
        eyebrow={preview ? "Preview for administrators" : undefined}
        actions={
          <Link href="/matches" className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-fg-muted hover:text-fg" data-testid="insights-back">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Team matches
          </Link>
        }
      />

      <Panel aria-labelledby="insights-findings">
        <PanelHeader title={<span id="insights-findings">What stands out</span>} subtitle="Differences in the team's own games that are larger than chance would explain." />
        <PanelBody>
          {view.findings.length ? (
            <ul className="space-y-4" data-testid="insights-findings">
              {view.findings.map((f) => {
                const Icon = f.direction === "more" ? ArrowUpRight : ArrowDownRight;
                return (
                  <li key={f.key} className="flex gap-3" data-testid="insight-finding">
                    <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", f.direction === "more" ? "text-good" : "text-fg-muted")} aria-hidden />
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-medium text-fg">{f.headline}</p>
                      <p className="text-sm text-fg-muted">{f.detail}</p>
                      {f.mirror ? <p className="text-sm text-fg-muted">{f.mirror}</p> : null}
                      {f.span ? <p className="text-xs text-fg-subtle">{f.span}</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon={Scale} title="Nothing stands out yet" compact testId="insights-nothing">
              {view.nothing}
            </EmptyState>
          )}
        </PanelBody>
      </Panel>

      <Disclosure title="How this is worked out" description="What is compared, and what it does not say" testId="insights-method">
        <ul className="list-disc space-y-2 pl-5 text-sm text-fg-muted">
          {view.method.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        {view.excluded ? <p className="text-sm text-fg-muted">{view.excluded}</p> : null}
      </Disclosure>

      {view.rows.length ? <Comparisons rows={view.rows} /> : null}
    </div>
  );
}
