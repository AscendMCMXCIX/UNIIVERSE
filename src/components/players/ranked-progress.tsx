import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, RotateCcw } from "lucide-react";
import { rankProgress, type RankQueue } from "@/domain/rank-progress";
import { rankedYearCoverage, rankMovement, rankTimeline, type RankedYearCoverage, type RankMovement, type RankTimeline, type TimelineMarker } from "@/domain/rank-timeline";
import { RANKED_YEAR } from "@/domain/ranked-year";
import type { RankHistoryAccount } from "@/server/accounts/rank-history";
import { InfoTip } from "@/components/ui/info-tip";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { formatCount, formatDate, formatDateTime, formatDayMonth, formatLpChange } from "@/lib/format";
import { accountShortNames } from "@/domain/account-names";
import { cn } from "@/lib/cn";
import { RankEmblem } from "./rank-emblem";
import { RankTimelineChart } from "./rank-timeline-chart";

const QUEUE_LABEL: Record<RankQueue, string> = { solo: "Ranked Solo/Duo", flex: "Ranked Flex" };
const QUEUE_SHORT: Record<RankQueue, string> = { solo: "Solo/Duo", flex: "Flex" };
/** The readings table lists at most this many, newest first. */
const TABLE_ROWS = 200;

export type RankedProgressHref = (change: { rq?: RankQueue; ra?: string | null }) => string;

/**
 * Ranked progress of one linked account (the Main account unless another is chosen), one queue at
 * a time, in the 2026 ranked year. Compact: where the account stands now (Riot's current rank, LP
 * and the year's wins and losses), how it moved, and a small chart of the stretch UNIIVERSE has
 * read. Riot reports no past ranks, so nothing before the first reading is drawn; the details say
 * how much of the year that covers, beside the ranked games stored for the whole year, and list
 * every reading and rank change.
 */
export function RankedProgress({ accounts, queue, accountId, href, now }: { accounts: RankHistoryAccount[]; queue: RankQueue; accountId: string | null; href: RankedProgressHref; now: number }) {
  if (accounts.length === 0) return null;
  const account = accounts.find((a) => a.id === accountId) ?? accounts.find((a) => a.snapshots.length > 0) ?? accounts[0]!;
  const snapshots = account.snapshots.filter((s) => s.queue === queue);
  const cur = rankProgress(queue, snapshots, now).current;
  const timeline = rankTimeline(snapshots, now);
  const movement = rankMovement(timeline, now);
  const coverage = rankedYearCoverage(timeline, account.weeks[queue], now);
  const names = accountShortNames(accounts);
  const changes = [...timeline.markers].reverse();
  const season = coverage.season ? `${RANKED_YEAR} ${coverage.season.label}` : null;
  const hasLine = timeline.readings.some((r) => r.score !== null);
  return (
    <section id="ranked-progress" aria-labelledby="ranked-progress-title" className="@container/rank space-y-3 rounded-card border border-border bg-surface p-4 panel-depth" data-testid="ranked-progress">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="ranked-progress-title" className="flex items-center gap-1.5 text-base font-semibold text-fg">
            Ranked progress
            <InfoTip
              label="About ranked progress"
              text={`Riot's API reports only an account's current rank, never past ones. So the chart starts at UNIIVERSE's first reading of this rank and nothing earlier is drawn or estimated. The line continues only across at most one game; a shaded band marks several games played between two readings. Wins and losses are Riot's own count for the ${RANKED_YEAR} ranked year (one ladder since 8 January: Seasons 1, 2 and 3 share it).`}
            />
          </h2>
          <p className="text-xs text-fg-subtle wrap-anywhere" data-testid="ranked-tracking">
            {account.riotId}
            {season ? ` · ${season}` : ""}
            {timeline.trackingSince ? ` · rank recorded since ${formatDate(timeline.trackingSince)}` : " · no rank recorded yet"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Queue" className={segmentedGroupClass()}>
            {(["solo", "flex"] as const).map((q) => (
              <Link key={q} href={href({ rq: q })} scroll={false} aria-current={q === queue ? "page" : undefined} className={segmentClass(q === queue)} data-testid={`ranked-queue-${q}`}>
                {QUEUE_SHORT[q]}
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

      {/* Where the account stands and how it moved, beside the chart of what was read (stacked when narrow). */}
      <div className="grid gap-x-6 gap-y-3 @min-[40rem]/rank:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] @min-[40rem]/rank:items-center">
        <div className="min-w-0 space-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <RankEmblem tier={cur?.tier ?? null} className="h-11 w-11 shrink-0" />
            {cur ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-bold leading-tight text-fg" data-testid="ranked-current">
                  {cur.label}
                  {cur.leaguePoints !== null ? ` · ${cur.leaguePoints} LP` : ""}
                </p>
                <LpBar tier={cur.tier} lp={cur.leaguePoints} />
                {cur.wins !== null && cur.losses !== null ? (
                  <p className="text-2xs tabular-nums text-fg-muted" title={`Riot's count of ${QUEUE_LABEL[queue]} games in the ${RANKED_YEAR} ranked year`}>
                    {cur.wins}W {cur.losses}L{cur.wins + cur.losses > 0 ? ` · ${Math.round((cur.wins / (cur.wins + cur.losses)) * 100)}%` : ""} · {RANKED_YEAR} (Riot)
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="min-w-0 flex-1 text-sm text-fg-muted" data-testid="ranked-empty">
                No {QUEUE_LABEL[queue]} rank recorded for this account yet.
              </p>
            )}
          </div>
          {cur ? (
            <dl className="grid grid-cols-2 gap-x-4 border-t border-border pt-2.5">
              <Movement m={movement} unranked={cur.tier === null} />
              <div className="min-w-0" data-testid="ranked-peak-stat">
                <dt className="text-2xs text-fg-subtle">Highest recorded</dt>
                <dd>
                  {timeline.peak ? (
                    <>
                      <span className="block text-sm font-semibold text-fg" title={`${timeline.peak.label} ${timeline.peak.lp} LP`}>
                        {timeline.peak.label} · {timeline.peak.lp}\u00a0LP
                      </span>
                      <span className="block text-2xs text-fg-subtle">first read {formatDayMonth(timeline.peak.at)}</span>
                    </>
                  ) : (
                    <span className="block text-sm text-fg-muted">Not recorded</span>
                  )}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
        {hasLine ? (
          <RankTimelineChart t={timeline} label={`${QUEUE_LABEL[queue]} rank since ${formatDate(timeline.trackingSince!)}`} />
        ) : (
          <p className="rounded-card border border-dashed border-border px-3 py-4 text-center text-xs text-fg-muted" data-testid="ranked-no-chart">
            {timeline.trackingSince === null ? "The chart starts at the first reading of this rank. Riot reports no past ranks, so none can be filled in." : "No ranked reading to draw: this queue was read as unranked."}
          </p>
        )}
      </div>

      <details className="group/details border-t border-border pt-2" data-testid="ranked-details">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-sm text-xs font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden" data-testid="ranked-details-toggle">
          <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open/details:rotate-90" aria-hidden />
          History and coverage
          <span className="hidden font-normal text-fg-subtle @min-[26rem]/rank:inline">
            · {formatCount(timeline.readings.length)} reading{timeline.readings.length === 1 ? "" : "s"} · {formatCount(changes.length)} rank change{changes.length === 1 ? "" : "s"}
          </span>
        </summary>
        <div className="mt-3 space-y-5">
          <YearCoverage c={coverage} queue={queue} />
          <div className="grid gap-x-6 gap-y-4 @min-[44rem]/rank:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-1.5 text-xs font-medium text-fg-subtle">Rank changes recorded</h3>
              {changes.length === 0 ? (
                <p className="text-xs text-fg-muted">No promotion, demotion or reset recorded.</p>
              ) : (
                <ol className="space-y-1" data-testid="ranked-events">
                  {changes.map((m, i) => (
                    <ChangeRow key={`${m.at}-${i}`} m={m} />
                  ))}
                </ol>
              )}
            </div>
            {hasLine ? <ChartKey t={timeline} /> : null}
          </div>
          {timeline.readings.length ? <ReadingsTable t={timeline} /> : null}
        </div>
      </details>
    </section>
  );
}

/** How far into the division the LP is (below Master, where a division is 100 LP); Master and above have no bar. */
function LpBar({ tier, lp }: { tier: string | null; lp: number | null }) {
  if (!tier || lp === null || ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier.toUpperCase())) return null;
  const pct = Math.min(100, Math.max(0, lp));
  return (
    <span className="my-1 block h-1 w-full max-w-40 overflow-hidden rounded-full bg-surface-3" aria-hidden data-testid="ranked-lp-bar">
      <span className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-2" style={{ width: `${pct}%` }} />
    </span>
  );
}

function Movement({ m, unranked }: { m: RankMovement | null; unranked: boolean }) {
  if (!m)
    return (
      <div className="min-w-0">
        <dt className="text-2xs text-fg-subtle">Last 30 days</dt>
        <dd className="text-sm text-fg-muted" data-testid="ranked-change-none">
          {unranked ? "Unranked now: nothing to compare" : "Not enough readings in 30 days"}
        </dd>
      </div>
    );
  const value = m.kind === "lp" ? (m.amount === 0 ? "No change" : formatLpChange(m.amount)) : m.kind === "divisions" ? `${m.amount > 0 ? "+" : "−"}${Math.abs(m.amount)} division${Math.abs(m.amount) === 1 ? "" : "s"}` : `${m.from.label} → ${m.to.label}`;
  const dir = m.kind === "tiers" ? (m.to.score! > m.from.score! ? 1 : -1) : Math.sign(m.amount);
  const path = `${m.from.label} ${m.from.lp ?? 0} LP → ${m.to.label} ${m.to.lp ?? 0} LP`;
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-fg-subtle">{m.windowed ? "Last 30 days" : `Since ${formatDayMonth(m.from.from)}`}</dt>
      <dd>
        <span className={cn("block truncate text-sm font-semibold tabular-nums", dir > 0 ? "text-good" : dir < 0 ? "text-bad" : "text-fg-muted")} title={path} data-testid="ranked-change" data-kind={m.kind}>
          {value}
        </span>
        <span className="block truncate text-2xs text-fg-subtle" title={path}>
          {m.from === m.to ? `${m.to.label} ${m.to.lp ?? 0} LP since ${formatDayMonth(m.to.from)}` : `from ${m.from.label} ${m.from.lp ?? 0} LP`}
        </span>
      </dd>
    </div>
  );
}

/**
 * The ranked year so far as one strip: the stored ranked games week by week (wins up, losses
 * down), Riot's seasons marked on it, and the part with rank readings lit. Says in words what can
 * and cannot be known before the first reading.
 */
function YearCoverage({ c, queue }: { c: RankedYearCoverage; queue: RankQueue }) {
  const span = Math.max(1, c.to - c.from);
  const pos = (at: number) => `${(Math.min(Math.max(at, c.from), c.to) - c.from) / span * 100}%`;
  const week = 7 * 86_400_000;
  const max = Math.max(1, ...c.weeks.map((w) => Math.max(w.wins, w.losses)));
  const played = c.games.wins + c.games.losses;
  return (
    <div className="min-w-0" data-testid="ranked-coverage">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-xs font-medium text-fg-subtle">{RANKED_YEAR} ranked year</h3>
        <span className="text-2xs tabular-nums text-fg-subtle" data-testid="ranked-coverage-days" title="Calendar days covered by a reading (from its first sight to its last confirmation), or between two readings at most one game apart">
          Rank known on {formatCount(c.knownDays)} of {formatCount(c.yearDays)} days
        </span>
      </div>
      <div className="relative h-10" aria-hidden>
        {c.trackedFrom !== null ? <span className="absolute inset-y-0 right-0 rounded-sm border-l border-accent/70 bg-accent/10" style={{ left: pos(c.trackedFrom) }} data-testid="ranked-coverage-tracked" /> : null}
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
        {c.seasons.slice(1).map((s) => (
          <span key={s.label} className="absolute inset-y-0 w-px bg-border-strong" style={{ left: pos(s.from) }} />
        ))}
        {c.weeks.map((w) => (
          <span key={w.week} className="absolute inset-y-0 flex flex-col justify-center px-px" style={{ left: pos(w.week), width: `${(week / span) * 100}%` }} data-testid="ranked-week" data-wins={w.wins} data-losses={w.losses}>
            <span className="flex h-1/2 flex-col justify-end pb-px">{w.wins > 0 ? <span className="block rounded-t-sm bg-blue/85" style={{ height: `${Math.max(8, (w.wins / max) * 100)}%` }} /> : null}</span>
            <span className="flex h-1/2 flex-col justify-start pt-px">{w.losses > 0 ? <span className="block rounded-b-sm bg-red/80" style={{ height: `${Math.max(8, (w.losses / max) * 100)}%` }} /> : null}</span>
          </span>
        ))}
      </div>
      <div className="relative mt-1 h-4 text-2xs text-fg-subtle" aria-hidden>
        {c.seasons.map((s, i) => (
          <span key={s.label} className={cn("absolute whitespace-nowrap", i === 0 ? "" : "pl-1")} style={{ left: pos(s.from) }}>
            {s.label}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-2xs leading-relaxed text-fg-muted" data-testid="ranked-coverage-note">
        Games: {played > 0 ? `${formatCount(played)} ${QUEUE_LABEL[queue]} games stored since 8 January (${c.games.wins}W ${c.games.losses}L), wins above the line, losses below.` : `no ${QUEUE_LABEL[queue]} game stored this year.`}{" "}
        Rank and LP: {c.trackedFrom !== null ? `only from the first reading, ${formatDateTime(c.trackedFrom)} (lit).` : "no reading yet."} Riot&apos;s API gives only the current rank, so earlier ranks, LP and each earlier game&apos;s LP cannot be recovered.
      </p>
    </div>
  );
}

function ChangeRow({ m }: { m: TimelineMarker }) {
  const up = m.kind === "promotion" || m.kind === "placed";
  const Icon = m.kind === "reset" ? RotateCcw : up ? ArrowUp : ArrowDown;
  const word = { promotion: "Promoted", demotion: "Demoted", reset: "Reset", placed: "Placed" }[m.kind];
  return (
    <li className="flex items-center gap-2 text-xs" data-kind={m.kind} data-exact={m.exact}>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", m.kind === "reset" ? "text-fg-muted" : up ? "text-good" : "text-bad")} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-fg">
        {word}: {m.kind === "reset" ? `${m.from} → ${m.to}` : m.to}
      </span>
      <span className="shrink-0 tabular-nums text-fg-subtle" title={m.exact ? "Between two readings one game apart" : m.kind === "reset" || m.kind === "placed" ? "Somewhere between these two readings" : "Somewhere between these two readings, several games apart"}>
        {m.exact ? formatDate(m.at) : `${formatDayMonth(m.since)} – ${formatDayMonth(m.at)}`}
      </span>
    </li>
  );
}

function ChartKey({ t }: { t: RankTimeline }) {
  const hasGap = t.links.some((l) => l.kind === "gap");
  const hasUntracked = t.trackingSince !== null && t.trackingSince > t.from;
  return (
    <div className="min-w-0">
      <h3 className="mb-1.5 text-xs font-medium text-fg-subtle">Reading the chart</h3>
      <ul className="space-y-1 text-2xs text-fg-muted" data-testid="ranked-key">
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 shrink-0 rounded bg-gradient-to-r from-accent to-accent-2" aria-hidden />
          Rank read by UNIIVERSE
        </li>
        <li className="flex items-center gap-1.5">
          <span className="shrink-0 text-good" aria-hidden>
            ▲
          </span>
          <span className="shrink-0 text-bad" aria-hidden>
            ▼
          </span>
          Promotion, demotion (hollow: somewhere within several games)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="shrink-0 text-accent-2" aria-hidden>
            ◆
          </span>
          Highest recorded
        </li>
        {hasGap ? (
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded-sm border border-dashed border-fg-subtle/60 bg-fg-subtle/10" aria-hidden />
            Several games between two readings: not seen one by one
          </li>
        ) : null}
        {hasUntracked ? (
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-3 shrink-0 rounded-sm border border-fg-subtle/40 bg-[repeating-linear-gradient(45deg,var(--color-fg-subtle)_0_1px,transparent_1px_4px)] opacity-60" aria-hidden />
            Not recorded
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function ReadingsTable({ t }: { t: RankTimeline }) {
  const rows = [...t.readings].reverse().slice(0, TABLE_ROWS);
  return (
    <div className="min-w-0">
      <h3 className="mb-1.5 text-xs font-medium text-fg-subtle">
        Every reading{t.readings.length > TABLE_ROWS ? ` (newest ${TABLE_ROWS} of ${formatCount(t.readings.length)})` : ""}
      </h3>
      <div className="max-h-64 overflow-auto rounded-card border border-border" data-testid="ranked-table" tabIndex={0} role="region" aria-label="Rank readings, newest first">
        <table className="w-full text-left text-xs tabular-nums">
          <caption className="sr-only">Rank readings, newest first</caption>
          <thead className="sticky top-0 bg-bg-elevated text-2xs text-fg-subtle">
            <tr>
              <th scope="col" className="px-2 py-1.5 font-medium">
                First read
              </th>
              <th scope="col" className="px-2 py-1.5 font-medium">
                Rank
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium" title="Riot's count of wins and losses in the ranked year at that reading">
                W–L
              </th>
              <th scope="col" className="hidden px-2 py-1.5 font-medium @min-[32rem]/rank:table-cell">
                Last confirmed
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.from} className="border-t border-border/60">
                <td className="whitespace-nowrap px-2 py-1 text-fg-muted">{formatDateTime(r.from)}</td>
                <td className="whitespace-nowrap px-2 py-1 font-medium text-fg">
                  {r.label}
                  {r.lp !== null ? ` · ${r.lp} LP` : ""}
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right text-fg-muted">{r.wins !== null && r.losses !== null ? `${r.wins}–${r.losses}` : "—"}</td>
                <td className="hidden whitespace-nowrap px-2 py-1 text-fg-subtle @min-[32rem]/rank:table-cell">{r.to > r.from ? formatDateTime(r.to) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
