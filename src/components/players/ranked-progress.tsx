import Link from "next/link";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { rankProgress, TIERS, type RankEvent, type RankProgress, type RankQueue } from "@/domain/rank-progress";
import type { RankHistoryAccount } from "@/server/accounts/rank-history";
import { InfoTip } from "@/components/ui/info-tip";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { formatDate } from "@/lib/format";
import { accountShortNames } from "@/domain/account-names";
import { cn } from "@/lib/cn";

const QUEUE_LABEL: Record<RankQueue, string> = { solo: "Ranked Solo/Duo", flex: "Ranked Flex" };

/**
 * Ranked progress of one linked account (the Main account unless another is chosen), one queue at
 * a time. History starts when UNIIVERSE first read the rank; nothing before that is drawn.
 */
export function RankedProgress({ accounts, queue, accountId, href, now }: { accounts: RankHistoryAccount[]; queue: RankQueue; accountId: string | null; href: (change: { rq?: RankQueue; ra?: string | null }) => string; now: number }) {
  if (accounts.length === 0) return null;
  const account = accounts.find((a) => a.id === accountId) ?? accounts.find((a) => a.snapshots.length > 0) ?? accounts[0]!;
  const progress = rankProgress(queue, account.snapshots, now);
  const names = accountShortNames(accounts);
  return (
    <section aria-labelledby="ranked-progress" className="h-full space-y-2.5 rounded-card border border-border bg-surface/60 p-4" data-testid="ranked-progress">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="ranked-progress" className="flex items-center gap-1.5 text-lg font-semibold text-fg">
            Ranked progress
            <InfoTip label="About ranked progress" text="Riot only reports the current rank, so the history starts when it was first read and grows with every sync that sees a change. Divisions are drawn as one ladder, so a promotion is a step up rather than an LP drop; a season reset starts a new line." />
          </h2>
          <p className="text-sm text-fg-muted" data-testid="ranked-tracking">
            {account.riotId}
            {progress.trackingSince ? ` · tracked since ${formatDate(new Date(progress.trackingSince))}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Queue" className={segmentedGroupClass()}>
            {(["solo", "flex"] as const).map((q) => (
              <Link key={q} href={href({ rq: q })} scroll={false} aria-current={q === queue ? "page" : undefined} className={segmentClass(q === queue)} data-testid={`ranked-queue-${q}`}>
                {q === "solo" ? "Solo/Duo" : "Flex"}
              </Link>
            ))}
          </nav>
          {accounts.length > 1 ? (
            // Every account the same way: its in-game name (with the tagline only where two share a
            // name), the full Riot ID on hover. No badge marks the main one; the list is in the
            // player's own order, which already puts it first.
            <nav aria-label="Account" className={segmentedGroupClass()}>
              {accounts.map((a) => (
                <Link key={a.id} href={href({ ra: a.id })} scroll={false} aria-current={a.id === account.id ? "page" : undefined} title={a.riotId} className={segmentClass(a.id === account.id, { className: "max-w-[10rem]" })} data-testid="ranked-account">
                  <span className="min-w-0 truncate">{names.get(a.id)}</span>
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </div>
      <ProgressBody progress={progress} queue={queue} />
    </section>
  );
}

function ProgressBody({ progress, queue }: { progress: RankProgress; queue: RankQueue }) {
  const cur = progress.current;
  // Where you stand and how you got there on the left, the line on the right: one short row
  // instead of the chart and the list stacked under a separate headline. The same two columns in
  // every state (no rank yet, one reading, a history), and the chart's space is always kept, so
  // switching queue or account never moves the page.
  return (
    <div className="grid items-start gap-x-5 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      {cur === null ? (
        <p className="min-w-0 text-sm text-fg-muted" data-testid="ranked-empty">
          No {QUEUE_LABEL[queue]} rank recorded for this account yet. It appears after the next account sync that finds one.
        </p>
      ) : (
        <div className="min-w-0 space-y-2">
          <div>
            <span className="block text-xl font-bold text-fg" data-testid="ranked-current">
              {cur.label}
              {cur.leaguePoints !== null ? ` · ${cur.leaguePoints} LP` : ""}
            </span>
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              {cur.wins !== null && cur.losses !== null ? <span className="text-sm tabular-nums text-fg-muted">{cur.wins}W {cur.losses}L this season</span> : null}
              {progress.change ? (
                <span className={cn("text-sm font-medium tabular-nums", progress.change.points > 0 ? "text-good" : progress.change.points < 0 ? "text-bad" : "text-fg-muted")} data-testid="ranked-change" title={`${progress.change.from} → ${progress.change.to}`}>
                  {progress.change.points > 0 ? "+" : ""}
                  {progress.change.points} ladder points in {progress.change.days} days
                </span>
              ) : null}
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="mb-1 text-xs font-medium text-fg-subtle">Rank changes</h3>
            {progress.events.length === 0 ? (
              <p className="text-xs text-fg-muted">No promotion, demotion or reset recorded yet.</p>
            ) : (
              <ol className="space-y-1" data-testid="ranked-events">
                {progress.events.slice(0, 4).map((e, i) => (
                  <EventRow key={`${e.at}-${i}`} e={e} />
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
      <div className="min-w-0 self-center">
        {progress.points.length >= 2 ? (
          <RankChart progress={progress} label={`${QUEUE_LABEL[queue]} rank over time`} />
        ) : (
          // The chart's own proportions (600×150, at most 10rem tall): nothing is drawn from a single
          // reading or none, and nothing is invented to fill it.
          <div className="grid aspect-[4/1] max-h-40 w-full place-items-center rounded-md border border-dashed border-border px-3 text-center text-xs text-fg-muted" data-testid="ranked-chart-empty">
            Not enough rank history to display progression.
          </div>
        )}
      </div>
    </div>
  );
}

function EventRow({ e }: { e: RankEvent }) {
  const up = e.kind === "promotion" || e.kind === "tier-up" || e.kind === "placed";
  const Icon = e.kind === "reset" ? RotateCcw : up ? ArrowUp : ArrowDown;
  const word = { promotion: "Promoted", "tier-up": "Promoted", demotion: "Demoted", "tier-down": "Demoted", reset: "Season reset", placed: "Placed" }[e.kind];
  return (
    <li className="flex items-center gap-2 text-xs" data-kind={e.kind}>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", e.kind === "reset" ? "text-fg-muted" : up ? "text-good" : "text-bad")} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-fg">
        {word}: {e.kind === "reset" ? `${e.from} → ${e.to}` : e.to}
      </span>
      <span className="shrink-0 tabular-nums text-fg-subtle">{formatDate(new Date(e.at))}</span>
    </li>
  );
}

/** A step line on the ladder scale, with tier bands labelled; segments are not joined across a reset. */
function RankChart({ progress, label }: { progress: RankProgress; label: string }) {
  // Wide and short: the chart takes the column's width at its own proportions (no empty bands
  // above and below), and its labels are drawn large enough to stay legible when scaled down.
  const W = 600;
  const H = 150;
  const pad = { l: 92, r: 8, t: 10, b: 24 };
  const pts = progress.points;
  const t0 = pts[0]!.at;
  const t1 = Math.max(pts.at(-1)!.at, t0 + 1);
  const lo = Math.floor((Math.min(...pts.map((p) => p.score)) - 30) / 100) * 100;
  const hi = Math.ceil((Math.max(...pts.map((p) => p.score)) + 30) / 100) * 100;
  const x = (at: number) => pad.l + ((at - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (s: number) => pad.t + (1 - (s - lo) / Math.max(1, hi - lo)) * (H - pad.t - pad.b);
  const lines: string[] = [];
  for (let seg = 0; seg < progress.segments; seg++) {
    const p = pts.filter((q) => q.segment === seg);
    if (p.length === 0) continue;
    lines.push(p.map((q, i) => `${i ? "L" : "M"}${x(q.at).toFixed(1)},${y(q.score).toFixed(1)}`).join(" "));
  }
  // Division gridlines with labels (each 100 points is a division; Master+ is one band).
  const grid: Array<{ s: number; label: string }> = [];
  for (let s = lo; s <= hi; s += 100) {
    const tier = TIERS[Math.min(Math.floor(s / 400), 7)]!;
    const apex = s >= 2800;
    const div = ["IV", "III", "II", "I"][Math.floor((s % 400) / 100)];
    grid.push({ s, label: apex ? (s === 2800 ? "Master" : "") : `${tier[0]}${tier.slice(1).toLowerCase()} ${div}` });
  }
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto max-h-40 w-full" role="img" aria-label={`${label}: from ${pts[0]!.label} ${pts[0]!.leaguePoints} LP to ${pts.at(-1)!.label} ${pts.at(-1)!.leaguePoints} LP`} data-testid="ranked-chart">
        {grid.map((g) => (
          <g key={g.s}>
            <line x1={pad.l} x2={W - pad.r} y1={y(g.s)} y2={y(g.s)} className="stroke-border" strokeWidth={1} strokeDasharray="3 4" />
            {g.label && g.s < hi ? (
              <text x={pad.l - 8} y={y(g.s) + 5} textAnchor="end" className="fill-fg-subtle text-[15px]">
                {g.label}
              </text>
            ) : null}
          </g>
        ))}
        {lines.map((d, i) => (
          <path key={i} d={d} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" />
        ))}
        {pts.map((p, i) => (
          <circle key={i} cx={x(p.at)} cy={y(p.score)} r={4} className="fill-accent">
            <title>{`${p.label} ${p.leaguePoints} LP · ${formatDate(new Date(p.at))}`}</title>
          </circle>
        ))}
        <text x={pad.l} y={H - 4} className="fill-fg-subtle text-[15px]">
          {formatDate(new Date(t0))}
        </text>
        <text x={W - pad.r} y={H - 4} textAnchor="end" className="fill-fg-subtle text-[15px]">
          {formatDate(new Date(t1))}
        </text>
      </svg>
    </figure>
  );
}
