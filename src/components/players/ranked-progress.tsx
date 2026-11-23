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
 * and the year's wins and losses), how it moved, and a small chart of the stretch UNIIVERSE has
 * read. Riot reports no past ranks, so nothing before the first reading is drawn. The card ends with
 * the chart (18 Nov 2026: the History and coverage disclosure under it, with the ranked year's strip,
 * the rank changes and every reading, was removed from the page; the readings, the history and their
 * calculations are unchanged, docs/RANKED_PROGRESS.md).
 *
 * One surface (23 Nov 2026): no rule or dashed box inside the card, only spacing. The chart needs
 * three different readings (two changes, CHART_MIN_READINGS); with fewer, one line says what was
 * recorded (fewReadings) instead of a large frame holding a flat line or a single step. The chart
 * takes the height the card gives it (7.5 to 24rem), so beside the pools in the Overview's 2×2,
 * where the card stands level with them, the ladder uses the room.
 *
 * On a touch phone (posture.ts) the card is a Fold (20 Nov 2026, PLAN S8a's Profile Overview
 * heights): its heading and where the account stands now (rank, LP, the year's wins and losses)
 * stay; the account line, the queue and account switches, the 30-day movement, the highest rank
 * and the chart are behind its Show. Tablets and desktop show everything, with no button.
 */
export function RankedProgress({ accounts, queue, accountId, href, now, className }: { accounts: RankHistoryAccount[]; queue: RankQueue; accountId: string | null; href: RankedProgressHref; now: number; /** The card's place (the Overview's 2×2 stretches it level with the pools). */ className?: string }) {
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
  return (
    <PhoneFoldSection id="ranked-progress" aria-labelledby="ranked-progress-title" className={cn("@container/rank flex flex-col gap-3 rounded-card border border-border bg-surface p-4 panel-depth", className)} data-testid="ranked-progress">
      {/* The title, then the line saying what is read, then the controls (the queue switch and,
          with several, the accounts), in that order for screen readers. On a narrow card (under
          32rem) one wrapping row: the switch shares the title's line where the two fit and goes
          under it where they do not (larger text), never over it; the tracking line comes last, on
          a line of its own. From 32rem the title and the tracking line on the left, the controls at
          the right, so the header is two lines tall, as before.
          On a touch screen the ⓘ is a 44px button around its 16px mark (InfoTip), reaching 0.875rem
          past the mark at either side and about 0.7rem under the title's line: there, on the narrow
          card, the gap beside the title is that reach (0.875rem) and the gap under it larger (1rem), so the switch never
          sits under the ⓘ's touch area, beside it or under it, and the switch wraps a little
          sooner rather than crowd it. (The gap beside it was 1rem until 20 Nov 2026; at 0.875rem the
          phone's Fold chevron keeps the title's line on a 320px phone at 150% text.) The tracking line keeps its usual 0.375rem from the line
          above (its margin gives back the larger gap): only the switch's place changes. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 @max-[32rem]/rank:pointer-coarse:gap-x-3.5 @max-[32rem]/rank:pointer-coarse:gap-y-4 @min-[32rem]/rank:grid @min-[32rem]/rank:grid-cols-[minmax(0,1fr)_auto] @min-[32rem]/rank:items-start @min-[32rem]/rank:gap-y-0.5">
        {/* The title claims only its wrapped width ("progress ⓘ", the ⓘ kept on the last word), so
            the switch stays beside it as long as even the wrapped title fits there; with larger
            text it goes under the title rather than over its ⓘ. No min-w-0: that minimum is the
            point. The tip's bubble is drawn in <body>, so the nowrap does not reach it. */}
        <h2 id="ranked-progress-title" className="flex-1 text-base font-semibold text-fg @min-[32rem]/rank:col-start-1 @min-[32rem]/rank:row-start-1">
          Ranked{" "}
          <span className="whitespace-nowrap">
            progress{" "}
            <InfoTip
              label="About ranked progress"
              text="Riot only shares the current rank, so the chart starts at the first check here. Shading marks games played between two checks."
            />
          </span>
        </h2>
        <p id="ranked-tracking" className={cn(PHONE_FOLDED, "order-last basis-full text-xs text-fg-subtle wrap-anywhere @max-[32rem]/rank:pointer-coarse:-mt-2.5 @min-[32rem]/rank:order-none @min-[32rem]/rank:col-start-1 @min-[32rem]/rank:row-start-2")} data-testid="ranked-tracking">
          {account.riotId}
          {season ? ` · ${season}` : ""}
          {timeline.trackingSince ? ` · rank recorded since ${formatDate(timeline.trackingSince)}` : " · no rank recorded yet"}
        </p>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 @min-[32rem]/rank:col-start-2 @min-[32rem]/rank:row-span-2 @min-[32rem]/rank:row-start-1">
          <PhoneFoldToggle label="the details of ranked progress" iconOnly controls={["ranked-tracking", "ranked-queues", accounts.length > 1 && "ranked-accounts", cur && "ranked-movement", "ranked-chart-fold"].filter(Boolean).join(" ")} testId="ranked-fold" />
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

      {/* Where the account stands and how it moved, beside the chart of what was read (stacked when
          narrow: the chart then takes whatever height the card has beyond the rest, up to 24rem, as
          the card stands level with the pools beside it in the Overview's 2×2). One surface: no
          rules or boxes inside the card, only spacing (23 Nov 2026). */}
      {/* The chart's row takes the rest of the card only in the Overview's 2×2 rail (a 1440px window,
          a card under 40rem): elsewhere the rows are implicit, so a phone's folded chart leaves no gap. */}
      <div className="grid min-h-0 flex-1 gap-x-6 gap-y-3 min-[90rem]:@max-[40rem]/rank:grid-rows-[auto_minmax(0,1fr)] @min-[40rem]/rank:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] @min-[40rem]/rank:items-center">
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
                  <p className="text-2xs tabular-nums text-fg-muted">
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
            <dl id="ranked-movement" className={cn(PHONE_FOLDED, "grid grid-cols-2 gap-x-4")}>
              <Movement m={movement} unranked={cur.tier === null} />
              <div className="min-w-0" data-testid="ranked-peak-stat">
                <dt className="text-2xs text-fg-subtle">Highest recorded</dt>
                <dd>
                  {timeline.peak ? (
                    <>
                      <span className="block text-sm font-semibold text-fg">
                        {timeline.peak.label} · {`${timeline.peak.lp}\u00a0LP`}
                      </span>
                      <span className="block text-2xs text-fg-subtle">first checked {formatDayMonth(timeline.peak.at)}</span>
                    </>
                  ) : (
                    <span className="block text-sm text-fg-muted">Not recorded</span>
                  )}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
        <div id="ranked-chart-fold" className={cn(PHONE_FOLDED, "flex min-h-0 min-w-0 flex-col justify-end")}>
          {chartable ? (
            <RankTimelineChart t={timeline} label={`${QUEUE_LABEL[queue]} rank since ${formatDate(timeline.trackingSince!)}`} fill />
          ) : (
            // Too little to draw (no rank, one, or two different readings): a line saying so in place of
            // a chart that would be a flat strip or a single step in a large empty frame.
            <p className="text-xs leading-relaxed text-fg-muted" data-testid="ranked-no-chart" data-readings={ranked.length}>
              {fewReadings(timeline, ranked)}
            </p>
          )}
        </div>
      </div>
    </PhoneFoldSection>
  );
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
