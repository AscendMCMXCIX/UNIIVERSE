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
import { RankedAccountSelect } from "./ranked-account-select";

const QUEUE_LABEL: Record<RankQueue, string> = { solo: "Ranked Solo/Duo", flex: "Ranked Flex" };
const QUEUE_SHORT: Record<RankQueue, string> = { solo: "Solo/Duo", flex: "Flex" };

export type RankedProgressHref = (change: { rq?: RankQueue; ra?: string | null }) => string;

/**
 * Ranked progress of one linked account (the Main account unless another is chosen), one queue at
 * a time, in the 2026 ranked year. Compact: where the account stands now (Riot's current rank, LP
 * and the year's wins, losses and win rate) beside how it moved in the last 30 days; under them the
 * queue and account choice in one row, then a small chart of the stretch UNIIVERSE has read. Riot
 * reports no past ranks, so nothing before the first reading is drawn. The card ends with the chart
 * (18 Nov 2026: the History and coverage disclosure under it was removed; the readings, the history
 * and their calculations are unchanged, docs/RANKED_PROGRESS.md).
 *
 * Simpler, after the UX review of Release 13 (owner item B3): the rank and the 30-day change lead;
 * the account, season and first check, the highest recorded rank and the change's path are behind
 * the ⓘ beside the rank (RankDetails). The chart is 7.5rem tall, 6rem in a narrow card (a phone):
 * never stretched to the card's height, where a few LP looked like a swing. It needs two changes of
 * rank or LP (CHART_MIN_CHANGES); with fewer, one line says what was recorded (fewReadings), "no
 * change recorded" for a rank that never moved, never a flat line in a frame.
 *
 * One card, the same on every screen (the owner's review of the phone's opened card, Release 13):
 * the title alone on its row (a phone's chevron at its end), never squeezed beside the controls;
 * the queue switch and, with two or more accounts, the account select together on one row of their
 * own, at its start, wrapping only when a large text size needs it (RankedAccountSelect).
 *
 * On a touch phone (posture.ts) the card is a Fold (20 Nov 2026, PLAN S8a's Profile Overview
 * heights): its heading, the rank and the 30-day change stay; the controls and the chart are one
 * part behind its Show, which fades in under them, nothing above it moving. Tablets and desktop show
 * everything, with no button.
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
  // The ranked readings (consecutive identical ones are already one), and how often the rank or LP
  // changed between them: a chart from two changes; fewer are said in a line (fewReadings).
  const ranked = timeline.readings.filter((r) => r.score !== null);
  const chartable = rankChanges(ranked) >= CHART_MIN_CHANGES;
  const tracking = `${account.riotId}${season ? ` · ${season}` : ""}${timeline.trackingSince ? ` · rank recorded since ${formatDate(timeline.trackingSince)}` : " · no rank recorded yet"}`;
  return (
    <PhoneFoldSection id="ranked-progress" aria-labelledby="ranked-progress-title" className="@container/rank flex flex-col gap-3 rounded-card border border-border bg-surface p-4 panel-depth" data-testid="ranked-progress">
      {/* The title alone on its row, a phone's chevron at its end. The ⓘ stays on the title's last
          word; on a touch screen its 44px button reaches 0.875rem past the mark, so the chevron keeps
          that gap. The title never shrinks below "progress ⓘ" (no min-w-0: that minimum is the point):
          where the two do not fit (200% text on a 320px phone) the chevron takes the next line, at its
          end, 1rem under it on a touch screen (the ⓘ reaches 0.875rem below its line), never under
          the ⓘ's touch area. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pointer-coarse:gap-x-3.5 pointer-coarse:gap-y-4">
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
        <PhoneFoldToggle label="the details of ranked progress" iconOnly controls="ranked-chart-fold" testId="ranked-fold" className="ml-auto" />
      </div>

      {/* One body (so the card's last part is drawn on a phone too, its chart folded). */}
      <div className="flex min-w-0 flex-col gap-3">
        {/* Where the account stands, and beside it how it moved in 30 days: the card's two figures,
            the change going under the rank where the card is too narrow for both. The rank wraps
            between its words at a large text size, never cut short ("Platin…" at 150% before). */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          {/* The rank's words go under the emblem where they would not keep 5rem beside it (200% text
              on a 320px phone, where "Platinum" ran 12px past the screen), never cut short. Under a
              15rem card (150% text and more on a phone, never at 100%) the emblem is 2rem and the rank
              a step smaller, so the rank takes two lines there, not three. */}
          <div className="flex min-w-0 flex-[1_1_13rem] flex-wrap items-center gap-x-3 gap-y-1.5">
            <RankEmblem tier={cur?.tier ?? null} className="h-11 w-11 shrink-0 @max-[15rem]/rank:h-8 @max-[15rem]/rank:w-8" />
            {cur ? (
              <div className="min-w-0 flex-[1_1_5rem]">
                <p className="text-lg font-bold leading-tight text-fg @max-[15rem]/rank:text-base">
                  {/* The ⓘ stays with the rank's last word ("57 LP ⓘ"), never on a line of its own. */}
                  <span data-testid="ranked-current">
                    {cur.label}
                    {cur.leaguePoints !== null ? ` · ${cur.leaguePoints} LP` : ""}
                  </span>
                  <span className="whitespace-nowrap">
                    {" "}
                    <span className="inline-flex align-middle text-sm font-normal">
                      <InfoTip label="About this rank" text={<RankDetails tracking={tracking} peak={timeline.peak} movement={movement} />} testId="ranked-rank-tip" />
                    </span>
                  </span>
                </p>
                <LpBar tier={cur.tier} lp={cur.leaguePoints} />
                {cur.wins !== null && cur.losses !== null ? (
                  <p className="text-xs tabular-nums text-fg-muted" data-testid="ranked-record">
                    {cur.wins}W {cur.losses}L{cur.wins + cur.losses > 0 ? ` · ${Math.round((cur.wins / (cur.wins + cur.losses)) * 100)}%` : ""}
                    {/* Its scope, shown from a 21rem card; read out on a narrower one (a phone), and in the ⓘ. */}
                    <span className="@max-[21rem]/rank:sr-only"> · {RANKED_YEAR} (Riot)</span>
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
            <dl id="ranked-movement" className="max-w-full shrink-0">
              <Movement m={movement} unranked={cur.tier === null} />
            </dl>
          ) : null}
        </div>
        {/* The details: the queue and account choice, then the chart (or its line), one part, which a
            phone folds away whole and fades in when opened. */}
        <div id="ranked-chart-fold" className={cn(PHONE_FOLDED, OPENS, "flex min-w-0 flex-col gap-3")}>
          <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="ranked-controls">
            <nav id="ranked-queues" aria-label="Queue" className={segmentedGroupClass("@max-[7.5rem]/rank:flex-col @max-[7.5rem]/rank:items-stretch")}>
              {(["solo", "flex"] as const).map((q) => (
                <Link key={q} href={href({ rq: q })} replace scroll={false} aria-current={q === queue ? "page" : undefined} className={segmentClass(q === queue)} data-testid={`ranked-queue-${q}`}>
                  {QUEUE_SHORT[q]}
                </Link>
              ))}
            </nav>
            {accounts.length > 1 ? <RankedAccountSelect value={account.id} accounts={accounts.map((a) => ({ id: a.id, label: names.get(a.id) ?? a.riotId, href: href({ ra: a.id }) }))} /> : null}
          </div>
          {chartable ? (
            <RankTimelineChart t={timeline} label={`${QUEUE_LABEL[queue]} rank since ${formatDate(timeline.trackingSince!)}`} />
          ) : (
            // Too little to draw (no rank, no change, or a single change): a line saying so in place of
            // a chart that would be a flat strip or a single step.
            <p className="text-xs leading-relaxed text-fg-muted" data-testid="ranked-no-chart" data-readings={ranked.length}>
              {fewReadings(timeline, ranked)}
            </p>
          )}
        </div>
      </div>
    </PhoneFoldSection>
  );
}

/** A phone's opened details fade in (the fade-in utility, 160ms; instant with reduced motion, globals.css), under what stays. */
const OPENS = "max-md:group-data-[fold=open]/fold:fade-in short:group-data-[fold=open]/fold:fade-in";

/**
 * What the ⓘ beside the rank holds (about 20 words): which account, season and first check the card
 * reads, the highest rank recorded, and the 30-day change's path. Facts a reader may want, never
 * what the card is for at a glance.
 */
function RankDetails({ tracking, peak, movement }: { tracking: string; peak: RankTimeline["peak"]; movement: RankMovement | null }) {
  return (
    <>
      <span data-testid="ranked-tracking">{tracking}</span>. The record is Riot&apos;s count for the ranked year.{" "}
      <span data-testid="ranked-peak-stat">{peak ? `Highest recorded: ${peak.label} · ${peak.lp} LP, first checked ${formatDayMonth(peak.at)}.` : "Highest recorded: not recorded."}</span>
      {movement ? <span data-testid="ranked-change-path">{` ${movementPath(movement)}`}</span> : null}
    </>
  );
}

/** The 30-day change's path in words: "From Gold III 47 LP to Gold IV 97 LP." or "Gold II 40 LP since 1 Oct." */
function movementPath(m: RankMovement): string {
  return m.from === m.to ? `${m.to.label} ${m.to.lp ?? 0} LP since ${formatDayMonth(m.to.from)}.` : `From ${m.from.label} ${m.from.lp ?? 0} LP to ${m.to.label} ${m.to.lp ?? 0} LP.`;
}

/** The fewest changes of rank or LP drawn as a chart. One change is a single step, none a flat line. */
export const CHART_MIN_CHANGES = 2;

/** How often the rank or LP changed between the ranked readings (consecutive identical readings are already one). */
export function rankChanges(ranked: readonly TimelineReading[]): number {
  let n = 0;
  for (let i = 1; i < ranked.length; i++) if (ranked[i]!.score !== ranked[i - 1]!.score) n++;
  return n;
}

const rankAt = (r: TimelineReading) => `${r.label}${r.lp !== null ? ` ${r.lp} LP` : ""}`;

/**
 * Ranked progress's line in place of a chart with too little to draw: what was recorded, in words,
 * with the same readings the chart would join (consecutive identical readings are one).
 */
export function fewReadings(t: RankTimeline, ranked: TimelineReading[]): string {
  // The ⓘ beside the rank says since when the rank is recorded; this line says what it did.
  if (t.trackingSince === null) return "No rank recorded yet. Riot shares no past ranks, so the record starts at the first check.";
  if (ranked.length === 0) return "Unranked at every check so far.";
  const first = ranked[0]!;
  const change = ranked.findIndex((r, i) => i > 0 && r.score !== ranked[i - 1]!.score);
  if (change < 0) return `${rankAt(first)} since ${formatDayMonth(first.from)}: no change recorded.`;
  return `One change so far: ${rankAt(ranked[change - 1]!)} to ${rankAt(ranked[change]!)}. A chart appears after the next.`;
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

/**
 * The 30-day change: its label over its value beside the rank, on one line ("Last 30 days −1
 * division") in a card under 21rem (a phone's), where it goes under the rank: a line less there.
 */
const MOVEMENT_LINE = "min-w-0 @max-[21rem]/rank:flex @max-[21rem]/rank:flex-wrap @max-[21rem]/rank:items-baseline @max-[21rem]/rank:gap-x-2";

function Movement({ m, unranked }: { m: RankMovement | null; unranked: boolean }) {
  if (!m)
    return (
      <div className={MOVEMENT_LINE}>
        <dt className="text-2xs text-fg-subtle">Last 30 days</dt>
        <dd className="text-sm text-fg-muted" data-testid="ranked-change-none">
          {unranked ? "Unranked now: nothing to compare" : "Not enough readings in 30 days"}
        </dd>
      </div>
    );
  const value = m.kind === "lp" ? (m.amount === 0 ? "No change" : formatLpChange(m.amount)) : m.kind === "divisions" ? `${m.amount > 0 ? "+" : "−"}${Math.abs(m.amount)} division${Math.abs(m.amount) === 1 ? "" : "s"}` : `${m.from.label} → ${m.to.label}`;
  const dir = m.kind === "tiers" ? (m.to.score! > m.from.score! ? 1 : -1) : Math.sign(m.amount);
  return (
    <div className={MOVEMENT_LINE}>
      <dt className="text-2xs text-fg-subtle">{m.windowed ? "Last 30 days" : `Since ${formatDayMonth(m.from.from)}`}</dt>
      <dd className={cn("text-lg font-bold leading-tight tabular-nums", dir > 0 ? "text-good" : dir < 0 ? "text-bad" : "text-fg-muted")} data-testid="ranked-change" data-kind={m.kind}>
        {value}
      </dd>
    </div>
  );
}
