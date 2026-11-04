import Link from "next/link";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { rankProgress, type RankQueue } from "@/domain/rank-progress";
import { rankTimeline, RANK_VIEWS, type RankView, type TimelineMarker } from "@/domain/rank-timeline";
import type { RankHistoryAccount } from "@/server/accounts/rank-history";
import { InfoTip } from "@/components/ui/info-tip";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { formatCount, formatDate, formatDayMonth } from "@/lib/format";
import { accountShortNames } from "@/domain/account-names";
import { cn } from "@/lib/cn";
import { RankEmblem } from "./rank-emblem";
import { RankTimelineChart } from "./rank-timeline-chart";

const QUEUE_LABEL: Record<RankQueue, string> = { solo: "Ranked Solo/Duo", flex: "Ranked Flex" };
const VIEW_LABEL: Record<RankView, string> = { year: "2026", s1: "Season 1", s2: "Season 2", s3: "Season 3" };
const VIEW_TITLE: Record<RankView, string> = { year: "the 2026 ranked year", s1: "2026 Season 1", s2: "2026 Season 2", s3: "2026 Season 3" };

export type RankedProgressHref = (change: { rq?: RankQueue; ra?: string | null; rv?: RankView }) => string;

/**
 * Ranked progress of one linked account (the Main account unless another is chosen), one queue
 * at a time, over the 2026 ranked year (from 8 January) or one of its seasons. Only what UNIIVERSE
 * read is drawn: Riot reports no past ranks, so the stretch before the first reading is shown as
 * not recorded, and the games of each week (stored from 8 January on) are drawn under the rank.
 */
export function RankedProgress({ accounts, queue, view = "year", accountId, href, now }: { accounts: RankHistoryAccount[]; queue: RankQueue; view?: RankView; accountId: string | null; href: RankedProgressHref; now: number }) {
  if (accounts.length === 0) return null;
  const account = accounts.find((a) => a.id === accountId) ?? accounts.find((a) => a.snapshots.length > 0) ?? accounts[0]!;
  const snapshots = account.snapshots.filter((s) => s.queue === queue);
  const progress = rankProgress(queue, snapshots, now);
  const timeline = rankTimeline(snapshots, account.weeks[queue], view, now);
  const names = accountShortNames(accounts);
  const cur = progress.current;
  const played = timeline.games.wins + timeline.games.losses;
  const changes = [...timeline.markers].reverse().slice(0, 5);
  return (
    <section id="ranked-progress" aria-labelledby="ranked-progress-title" className="@container/rank space-y-4 rounded-card border border-border bg-surface p-4 panel-depth sm:p-5" data-testid="ranked-progress">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id="ranked-progress-title" className="flex items-center gap-1.5 text-base font-semibold text-fg">
            Ranked progress
            <InfoTip
              label="About ranked progress"
              text="Riot reports only an account's current rank, never past ones, so the line starts when UNIIVERSE first read it and nothing earlier is drawn. Each reading is a rank Riot reported; the line continues only across at most one game, and a hatched band marks games played between two readings that were not seen one by one. The bars are the ranked games stored for each week, from 8 January."
            />
          </h2>
          <p className="text-xs text-fg-subtle" data-testid="ranked-tracking">
            {account.riotId}
            {timeline.trackingSince ? ` · rank recorded since ${formatDate(timeline.trackingSince)}` : " · no rank recorded yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Period" className={segmentedGroupClass()} data-testid="ranked-views">
            {RANK_VIEWS.map((v) => (
              <Link key={v} href={href({ rv: v })} scroll={false} aria-current={v === view ? "page" : undefined} className={segmentClass(v === view)} data-testid={`ranked-view-${v}`}>
                {VIEW_LABEL[v]}
              </Link>
            ))}
          </nav>
          <nav aria-label="Queue" className={segmentedGroupClass()}>
            {(["solo", "flex"] as const).map((q) => (
              <Link key={q} href={href({ rq: q })} scroll={false} aria-current={q === queue ? "page" : undefined} className={segmentClass(q === queue)} data-testid={`ranked-queue-${q}`}>
                {q === "solo" ? "Solo/Duo" : "Flex"}
              </Link>
            ))}
          </nav>
          {accounts.length > 1 ? (
            // Every account the same way: its in-game name (with the tagline only where two share a
            // name), the full Riot ID on hover, in the player's own order (the Main account first).
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

      {/* Where the account stands, its highest recorded rank, the last 30 days and the period's games:
          one term and its value per list, so the emblem can sit beside the first. */}
      <div className="grid grid-cols-2 gap-3 @min-[44rem]/rank:grid-cols-4">
        <div className="col-span-2 flex min-w-0 items-center gap-3 @min-[44rem]/rank:col-span-1">
          <RankEmblem tier={cur?.tier ?? null} className="h-10 w-10 shrink-0" />
          <dl className="min-w-0">
            <dt className="text-2xs text-fg-subtle">Current</dt>
            {cur ? (
              <dd>
                <span className="block truncate text-lg font-bold leading-tight text-fg" data-testid="ranked-current">
                  {cur.label}
                  {cur.leaguePoints !== null ? ` · ${cur.leaguePoints} LP` : ""}
                </span>
                {cur.wins !== null && cur.losses !== null ? (
                  <span className="block text-2xs tabular-nums text-fg-muted">
                    {cur.wins}W {cur.losses}L in 2026 (Riot)
                  </span>
                ) : null}
              </dd>
            ) : (
              <dd className="text-sm text-fg-muted" data-testid="ranked-empty">
                No {QUEUE_LABEL[queue]} rank recorded for this account yet.
              </dd>
            )}
          </dl>
        </div>
        <dl className="min-w-0" data-testid="ranked-peak-stat">
          <dt className="text-2xs text-fg-subtle">Highest recorded · {VIEW_LABEL[view]}</dt>
          <dd>
            {timeline.peak ? (
              <>
                <span className="block truncate text-sm font-semibold text-fg">
                  {timeline.peak.label} · {timeline.peak.lp} LP
                </span>
                <span className="block text-2xs text-fg-subtle">first read {formatDayMonth(timeline.peak.at)}</span>
              </>
            ) : (
              <span className="block text-sm text-fg-muted">Not recorded</span>
            )}
          </dd>
        </dl>
        <dl className="min-w-0">
          <dt className="text-2xs text-fg-subtle">Last 30 days</dt>
          <dd>
            {progress.change ? (
              <span className={cn("block text-sm font-semibold tabular-nums", progress.change.points > 0 ? "text-good" : progress.change.points < 0 ? "text-bad" : "text-fg-muted")} title={`${progress.change.from} → ${progress.change.to}`} data-testid="ranked-change">
                {progress.change.points > 0 ? "+" : ""}
                {progress.change.points} ladder points
              </span>
            ) : (
              <span className="block text-sm text-fg-muted">Not enough readings</span>
            )}
          </dd>
        </dl>
        <dl className="col-span-2 min-w-0 @min-[44rem]/rank:col-span-1">
          <dt className="text-2xs text-fg-subtle">Ranked games stored · {VIEW_LABEL[view]}</dt>
          <dd className="text-sm font-semibold tabular-nums text-fg" data-testid="ranked-games">
            {formatCount(played)}
            {played > 0 ? (
              <span className="ml-1 text-2xs font-normal text-fg-muted">
                {timeline.games.wins}W {timeline.games.losses}L
              </span>
            ) : null}
          </dd>
        </dl>
      </div>

      <RankTimelineChart t={timeline} label={`${QUEUE_LABEL[queue]} rank over ${VIEW_TITLE[view]}`} />

      <div className="min-w-0">
        <h3 className="mb-1 text-xs font-medium text-fg-subtle">Rank changes · {VIEW_LABEL[view]}</h3>
        {changes.length === 0 ? (
          <p className="text-xs text-fg-muted">No promotion, demotion or reset recorded in this period.</p>
        ) : (
          <ol className="grid gap-x-6 gap-y-1 @min-[40rem]/rank:grid-cols-2" data-testid="ranked-events">
            {changes.map((m, i) => (
              <ChangeRow key={`${m.at}-${i}`} m={m} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function ChangeRow({ m }: { m: TimelineMarker }) {
  const up = m.kind === "promotion" || m.kind === "placed";
  const Icon = m.kind === "reset" ? RotateCcw : up ? ArrowUp : ArrowDown;
  const word = { promotion: "Promoted", demotion: "Demoted", reset: "Season reset", placed: "Placed" }[m.kind];
  return (
    <li className="flex items-center gap-2 text-xs" data-kind={m.kind} data-exact={m.exact}>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", m.kind === "reset" ? "text-fg-muted" : up ? "text-good" : "text-bad")} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-fg">
        {word}: {m.kind === "reset" ? `${m.from} → ${m.to}` : m.to}
      </span>
      <span className="shrink-0 tabular-nums text-fg-subtle" title={m.exact ? "Between two readings one game apart" : "Somewhere between these two readings, several games apart"}>
        {m.exact ? formatDate(m.at) : `${formatDayMonth(m.since)} – ${formatDayMonth(m.at)}`}
      </span>
    </li>
  );
}
