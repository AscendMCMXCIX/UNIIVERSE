import Link from "next/link";
import { rankProgress, type RankQueue } from "@/domain/rank-progress";
import { rankMovement, rankTimeline, type RankMovement, type RankTimeline, type TimelineReading } from "@/domain/rank-timeline";
import { RANKED_YEAR, rankedSeasonAt } from "@/domain/ranked-year";
import type { RankHistoryAccount } from "@/server/accounts/rank-history";
import { InfoTip } from "@/components/ui/info-tip";
import { PhoneFoldSection, PhoneFoldToggle } from "@/components/ui/phone-fold";
import { PHONE_FOLDED } from "@/components/ui/phone-fold-classes";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { formatDate, formatDayMonth, formatLpChange } from "@/lib/format";
import { accountShortNames } from "@/domain/account-names";
import { cn } from "@/lib/cn";
import { RankEmblem } from "./rank-emblem";
import { RankTimelineChart } from "./rank-timeline-chart";

const QUEUE_LABEL: Record<RankQueue, string> = { solo: "Ranked Solo/Duo", flex: "Ranked Flex" };
const QUEUE_SHORT: Record<RankQueue, string> = { solo: "Solo/Duo", flex: "Flex" };

export type RankedProgressHref = (change: { rq?: RankQueue; ra?: string | null }) => string;

/**
 * Ranked progress of one linked account (the Main account unless another is chosen), one queue at
 * a time, in the 2026 ranked year. Compact: where the account stands now (Riot's current rank, LP
 * and the year's wins and losses) beside how it moved in the last 30 days, then a small chart of the
 * stretch UNIIVERSE has read. Riot reports no past ranks, so nothing before the first reading is
 * drawn. The card ends with the chart (18 Nov 2026: the History and coverage disclosure under it was
 * removed; the readings, the history and their calculations are unchanged, docs/RANKED_PROGRESS.md).
 *
 * Simpler, after the UX review of Release 13 (owner item B3): the two things a reader looks for, the
 * rank and the 30-day change, lead on one row; the account, season and first check, the highest
 * recorded rank and the change's path ("From Gold III 47 LP to Gold IV 97 LP") are behind the ⓘ
 * beside the rank (RankDetails). The chart is 7.5rem tall wherever it stands: one stretched to the
 * card's height made a move of a few LP look like a swing (the review). It needs three different
 * readings (two changes, CHART_MIN_READINGS); with fewer, one line says what was recorded
 * (fewReadings). No rule or box inside the card, only spacing.
 *
 * On a touch phone (posture.ts) the card is a Fold (20 Nov 2026, PLAN S8a's Profile Overview
 * heights): its heading, the rank and the 30-day change stay; the queue and account switches and the
 * chart are behind its Show. Tablets and desktop show everything, with no button.
 */
export function RankedProgress({ accounts, queue, accountId, href, now }: { accounts: RankHistoryAccount[]; queue: RankQueue; accountId: string | null; href: RankedProgressHref; now: number }) {
  if (accounts.length === 0) return null;
  const account = accounts.find((a) => a.id === accountId) ?? accounts.find((a) => a.snapshots.length > 0) ?? accounts[0]!;
  const snapshots = account.snapshots.filter((s) => s.queue === queue);
  const cur = rankProgress(queue, snapshots, now).current;
  const timeline = rankTimeline(snapshots, now);
  const movement = rankMovement(timeline, now);
  const names = accountShortNames(accounts);
  const seasonNow = rankedSeasonAt(now);
  const season = seasonNow ? `${RANKED_YEAR} ${seasonNow.label}` : null;
  // The ranked readings (consecutive identical ones are already one): a chart from three of them, so
  // it always shows at least two changes; fewer are said in a line (fewReadings).
  const ranked = timeline.readings.filter((r) => r.score !== null);
  const chartable = ranked.length >= CHART_MIN_READINGS;
  const tracking = `${account.riotId}${season ? ` · ${season}` : ""}${timeline.trackingSince ? ` · rank recorded since ${formatDate(timeline.trackingSince)}` : " · no rank recorded yet"}`;
  return (
    <PhoneFoldSection id="ranked-progress" aria-labelledby="ranked-progress-title" className="@container/rank flex flex-col gap-3 rounded-card border border-border bg-surface p-4 panel-depth" data-testid="ranked-progress">
      {/* The title, then the controls (the queue switch and, with several, the accounts), in that
          order for screen readers: one wrapping row, the switch on the title's line where the two fit
          and under it where they do not (larger text), never over it. On a touch screen the ⓘ is a
          44px button around its 16px mark (InfoTip), reaching 0.875rem past the mark at either side
          and about 0.7rem under the title's line: on a narrow card the gap beside the title is that
          reach and the gap under it larger (1rem), so the switch never sits under the ⓘ's touch area. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 @max-[32rem]/rank:pointer-coarse:gap-x-3.5 @max-[32rem]/rank:pointer-coarse:gap-y-4">
        {/* The title claims only its wrapped width ("progress ⓘ", the ⓘ kept on the last word). No
            min-w-0: that minimum is the point. The tip's bubble is drawn in <body>. */}
        <h2 id="ranked-progress-title" className="flex-1 text-base font-semibold text-fg">
          Ranked{" "}
          <span className="whitespace-nowrap">
            progress{" "}
            <InfoTip
              label="About ranked progress"
              text="Riot only shares the current rank, so the chart starts at the first check here. Shading marks games played between two checks."
            />
          </span>
        </h2>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <PhoneFoldToggle label="the details of ranked progress" iconOnly controls={["ranked-queues", accounts.length > 1 && "ranked-accounts", "ranked-chart-fold"].filter(Boolean).join(" ")} testId="ranked-fold" />
          <nav id="ranked-queues" aria-label="Queue" className={cn(PHONE_FOLDED, segmentedGroupClass())}>
            {(["solo", "flex"] as const).map((q) => (
              <Link key={q} href={href({ rq: q })} replace scroll={false} aria-current={q === queue ? "page" : undefined} className={segmentClass(q === queue)} data-testid={`ranked-queue-${q}`}>
                {QUEUE_SHORT[q]}
              </Link>
            ))}
          </nav>
          {accounts.length > 1 ? (
            // Every account the same way: its in-game name (with the tagline only where two share a
            // name), the full Riot ID on hover, in the player's own order (the Main account first).
            <nav id="ranked-accounts" aria-label="Account" className={cn(PHONE_FOLDED, segmentedGroupClass())}>
              {accounts.map((a) => (
                <Link key={a.id} href={href({ ra: a.id })} replace scroll={false} aria-current={a.id === account.id ? "page" : undefined} title={a.riotId} className={segmentClass(a.id === account.id, { className: "max-w-[10rem]" })} data-testid="ranked-account">
                  <span className="min-w-0 truncate">{names.get(a.id)}</span>
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </div>

      {/* Where the account stands, and beside it how it moved in 30 days: the card's two figures, on
          one row, the change going under the rank where the card is too narrow for both. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_13rem] items-center gap-3">
          <RankEmblem tier={cur?.tier ?? null} className="h-11 w-11 shrink-0" />
          {cur ? (
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-1.5 text-lg font-bold leading-tight text-fg">
                <span className="truncate" data-testid="ranked-current">
                  {cur.label}
                  {cur.leaguePoints !== null ? ` · ${cur.leaguePoints} LP` : ""}
                </span>
                <span className="text-sm font-normal">
                  <InfoTip label="About this rank" text={<RankDetails tracking={tracking} peak={timeline.peak} movement={movement} />} testId="ranked-rank-tip" />
                </span>
              </p>
              <LpBar tier={cur.tier} lp={cur.leaguePoints} />
              {cur.wins !== null && cur.losses !== null ? (
                <p className="text-2xs tabular-nums text-fg-muted">
                  {cur.wins}W {cur.losses}L{cur.wins + cur.losses > 0 ? ` · ${Math.round((cur.wins / (cur.wins + cur.losses)) * 100)}%` : ""} · {RANKED_YEAR} (Riot)
                </p>
              ) : null}
            </div>
          ) : (
            <p className="min-w-0 flex-1 text-sm text-fg-muted" data-testid="ranked-empty">
              No {QUEUE_LABEL[queue]} rank recorded for this account yet.{" "}
              <InfoTip label="About this account's ranks" text={<RankDetails tracking={tracking} peak={timeline.peak} movement={null} />} testId="ranked-rank-tip" />
            </p>
          )}
        </div>
        {cur ? (
          <dl id="ranked-movement" className="shrink-0">
            <Movement m={movement} unranked={cur.tier === null} />
          </dl>
        ) : null}
      </div>
      <div id="ranked-chart-fold" className={cn(PHONE_FOLDED, "min-w-0")}>
        {chartable ? (
          <RankTimelineChart t={timeline} label={`${QUEUE_LABEL[queue]} rank since ${formatDate(timeline.trackingSince!)}`} />
        ) : (
          // Too little to draw (no rank, one, or two different readings): a line saying so in place of
          // a chart that would be a flat strip or a single step.
          <p className="text-xs leading-relaxed text-fg-muted" data-testid="ranked-no-chart" data-readings={ranked.length}>
            {fewReadings(timeline, ranked)}
          </p>
        )}
      </div>
    </PhoneFoldSection>
  );
}

/**
 * What the ⓘ beside the rank holds (about 20 words): which account, season and first check the card
 * reads, the highest rank recorded, and the 30-day change's path. Facts a reader may want, never
 * what the card is for at a glance.
 */
function RankDetails({ tracking, peak, movement }: { tracking: string; peak: RankTimeline["peak"]; movement: RankMovement | null }) {
  return (
    <>
      <span data-testid="ranked-tracking">{tracking}</span>.{" "}
      <span data-testid="ranked-peak-stat">{peak ? `Highest recorded: ${peak.label} · ${peak.lp} LP, first checked ${formatDayMonth(peak.at)}.` : "Highest recorded: not recorded."}</span>
      {movement ? <span data-testid="ranked-change-path">{` ${movementPath(movement)}`}</span> : null}
    </>
  );
}

/** The 30-day change's path in words: "From Gold III 47 LP to Gold IV 97 LP." or "Gold II 40 LP since 1 Oct." */
function movementPath(m: RankMovement): string {
  return m.from === m.to ? `${m.to.label} ${m.to.lp ?? 0} LP since ${formatDayMonth(m.to.from)}.` : `From ${m.from.label} ${m.from.lp ?? 0} LP to ${m.to.label} ${m.to.lp ?? 0} LP.`;
}

/** The fewest ranked readings drawn as a chart: two changes. One change is a single step, none a flat line. */
export const CHART_MIN_READINGS = 3;

const rankAt = (r: TimelineReading) => `${r.label}${r.lp !== null ? ` ${r.lp} LP` : ""}`;

/**
 * Ranked progress's line in place of a chart with too little to draw: what was recorded, in words,
 * with the same readings the chart would join (consecutive identical readings are one).
 */
export function fewReadings(t: RankTimeline, ranked: TimelineReading[]): string {
  // The tracking line above already says since when the rank is recorded.
  if (t.trackingSince === null) return "No rank recorded yet. Riot shares no past ranks, so the record starts at the first check.";
  if (ranked.length === 0) return "Unranked at every check so far.";
  if (ranked.length === 1) return "No change recorded yet. A chart appears once the rank has moved twice.";
  return `One change so far: ${rankAt(ranked[0]!)} to ${rankAt(ranked[1]!)}. A chart appears after the next.`;
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
  return (
    <div className="min-w-0">
      <dt className="text-2xs text-fg-subtle">{m.windowed ? "Last 30 days" : `Since ${formatDayMonth(m.from.from)}`}</dt>
      <dd className={cn("text-lg font-bold leading-tight tabular-nums", dir > 0 ? "text-good" : dir < 0 ? "text-bad" : "text-fg-muted")} data-testid="ranked-change" data-kind={m.kind}>
        {value}
      </dd>
    </div>
  );
}
