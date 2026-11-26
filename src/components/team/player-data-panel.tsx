import type * as React from "react";
import Link from "next/link";
import type { PlayerDataReport } from "@/server/proficiency/provenance";
import { TIER_DESCRIPTIONS, type ProficiencyTier } from "@/domain/proficiency";
import { ROLE_LABELS } from "@/domain/roles";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { Info, METRIC_LABEL, METRIC_VALUE, Metric, MetricLabel } from "@/components/ui/metric";
import { BreakdownPopover } from "@/components/ui/breakdown-popover";
import { metricTooltip } from "@/domain/metrics";
import { formatCount, percent, timeAgo } from "@/lib/format";
import { ScrollRegion } from "@/components/ui/scroll-region";

const TIER_TONE: Record<ProficiencyTier, BadgeTone> = { core: "good", strong: "good", comfortable: "info", moderate: "neutral", rusty: "warn", unknown: "neutral" };

/**
 * RIOT DATA: what UNIIVERSE knows about this player from their linked accounts, where it came
 * from and how fresh it is, plus the per-champion proficiency shown on the cards. The admin
 * view adds raw sync diagnostics (never PUUIDs).
 */
export function PlayerDataPanel({ report, championsById, admin = false, playerName, selfView = false, showAccounts = true }: { report: PlayerDataReport; championsById: Record<string, PortraitChampion>; admin?: boolean; playerName: string; selfView?: boolean; /** The profile page lists accounts itself. */ showAccounts?: boolean }) {
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const summaryTone: BadgeTone = report.summary.state === "synced" ? "good" : report.summary.state === "error" ? "bad" : report.summary.state === "stale" ? "warn" : "neutral";
  return (
    <Panel>
      <PanelHeader
        title="Riot data"
        subtitle={`What is stored about ${selfView ? "you" : playerName} from linked Riot accounts. Pools are chosen by the player; this data only rates the champions in them.`}
        actions={<Badge tone={summaryTone}>{report.summary.label}</Badge>}
      />
      <PanelBody className="space-y-4">
        {showAccounts ? (
        <div>
          <SectionLabel className="mb-1.5">Accounts</SectionLabel>
          {report.accounts.length === 0 ? <p className="text-xs text-fg-muted">No Riot account linked yet. Link one below so proficiency can be measured.</p> : null}
          <div className="space-y-1.5">
            {report.accounts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs">
                <span className="font-medium text-fg">{a.riotId}</span>
                <Badge tone="neutral">
                  {a.platformLabel}
                  {a.platformSource === "riot" ? (
                    <span title="Server confirmed by Riot">
                      {" "}✓<span className="sr-only">, confirmed by Riot</span>
                    </span>
                  ) : null}
                </Badge>
                {a.rank ? <Badge tone="info">{a.rank}</Badge> : null}
                <Badge tone={a.sync.tone}>
                  {a.sync.label}
                </Badge>
                <span className="text-fg-subtle">Last updated {a.sync.lastUpdatedAt ? timeAgo(a.sync.lastUpdatedAt) : "never"}</span>
                <span className="w-full text-fg-muted">{a.sync.detail}</span>
                {admin ? (
                  <span className="w-full text-xs tabular-nums text-fg-subtle">
                    diagnostic · status={a.rawStatus} · matches folded={a.matchesFolded} · history rows={a.historyRows} · mastery rows={a.masteryRows} · resolve attempts={a.resolveAttempts} · resolved {a.resolvedAt ? timeAgo(a.resolvedAt) : "no"} · server source={a.platformSource}
                    {a.rawError ? ` · last error: ${a.rawError}` : ""}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        ) : null}

        {/* As many columns as fit at least 10rem each (four on a computer, one on a phone or at a large
            text size): two fixed columns on a phone let a label at 150–200% text run into the next one. */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-x-6 gap-y-3" data-testid="player-data-metrics">
          <Metric id="games-on-record" value={formatCount(report.gamesAnalysed)} />
          <Metric id="patch-games" value={formatCount(report.currentPatchGames)} />
          <div className="min-w-0">
            <div className={METRIC_LABEL}>
              Champions with data <Info text="Champions with at least one game or some mastery." label="About champions with data" />
            </div>
            <div className={METRIC_VALUE}>{formatCount(report.championsWithData)}</div>
          </div>
          <div className="min-w-0">
            <div className={METRIC_LABEL}>
              Last sync <Info text={metricTooltip("last-sync")} label="About last sync" />
            </div>
            <div className={METRIC_VALUE}>{report.lastSyncAt ? timeAgo(report.lastSyncAt) : "never"}</div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <SectionLabel>Champion proficiency</SectionLabel>
            <Info text={metricTooltip("proficiency-tier")} label="About champion proficiency" />
          </div>
          {report.champions.length === 0 ? (
            <p className="text-xs text-fg-muted">{report.accounts.length === 0 ? "Link a Riot account to see per-champion proficiency." : "No champion data yet. It appears after the first sync completes (a few minutes after linking, then every few hours)."}</p>
          ) : (
            <>
            <div className="space-y-1.5 md:hidden">
              {report.champions.map((c) => (
                <div key={c.championId} className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <ChampionPortrait champion={champ(c.championId)} size="xs" />
                    <span className="font-medium text-fg">{champ(c.championId).name}</span>
                    {c.inPool ? (
                      <span className="flex items-center gap-0.5 text-fg-subtle" title={`${c.inPool === "primary" ? "Main role" : "Off-role"} pool · ${ROLE_LABELS[c.role]}`}>
                        <RoleIcon role={c.role} className="h-3 w-3" />
                        {c.inPool === "secondary" ? <span className="text-xs">2nd</span> : null}
                      </span>
                    ) : (
                      <span className="text-xs text-fg-subtle">not in pool</span>
                    )}
                    <span className="flex-1" />
                    <TierWhy tier={c.tier} label={c.tierLabel} notes={c.notes} />
                  </div>
                  {/* The table's figures (primary, as its cells are), each with its label in the secondary grey. */}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-fg-muted" data-testid="player-data-figures">
                    <span><Figure>{formatCount(c.recentGames)}</Figure> recent</span>
                    <span><Figure>{formatCount(c.patchGames)}</Figure> this patch</span>
                    <span><Figure>{formatCount(c.games)}</Figure> on record</span>
                    <span>last game {c.lastPlayedAt ? timeAgo(c.lastPlayedAt) : "—"}</span>
                    {c.mastery ? <span><Figure>{formatCount(c.mastery.points)}</Figure> mastery · <Figure>M{c.mastery.level}</Figure></span> : null}
                    {c.knownRoleGames > 0 ? <span><Figure>{percent(c.roleShare, 0)}</Figure> of its games with a known role in {ROLE_LABELS[c.role]}</span> : null}
                    <span><Figure>{c.confidenceWord}</Figure> confidence</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Positioned, so the column heads' ⓘ descriptions (sr-only, absolute) are held by the region:
                at its static place past the region's edge one made a tablet's page scroll sideways. */}
            <ScrollRegion label="Champion data" className="relative hidden md:block">
              <table className="w-full text-xs">
                <thead className="text-left text-fg-muted">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Champion</th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="proficiency-tier">Experience</MetricLabel></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="recent-games">Recent</MetricLabel></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="patch-games">This patch</MetricLabel></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="games-on-record">On record</MetricLabel></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="last-played" /></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="mastery-points" /></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="role-usage" /></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="proficiency-confidence" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-fg">
                  {report.champions.map((c) => (
                    <tr key={c.championId} className="align-middle">
                      <td className="py-1.5 pr-3">
                        <span className="flex items-center gap-2">
                          <ChampionPortrait champion={champ(c.championId)} size="xs" />
                          <span className="font-medium text-fg">{champ(c.championId).name}</span>
                          {c.inPool ? (
                            <span className="flex items-center gap-0.5 text-fg-subtle" title={`${c.inPool === "primary" ? "Main role" : "Off-role"} pool · ${ROLE_LABELS[c.role]}`}>
                              <RoleIcon role={c.role} className="h-3 w-3" />
                              {c.inPool === "secondary" ? <span className="text-xs">2nd</span> : null}
                            </span>
                          ) : (
                            <span className="text-xs text-fg-subtle">not in pool</span>
                          )}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <TierWhy tier={c.tier} label={c.tierLabel} notes={c.notes} />
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{formatCount(c.recentGames)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{formatCount(c.patchGames)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{formatCount(c.games)}</td>
                      <td className="py-1.5 pr-3 text-fg-muted">{c.lastPlayedAt ? timeAgo(c.lastPlayedAt) : "—"}</td>
                      <td className="py-1.5 pr-3">{c.mastery ? `${formatCount(c.mastery.points)} pts · M${c.mastery.level}` : "—"}</td>
                      <td className="py-1.5 pr-3">{c.knownRoleGames > 0 ? `${percent(c.roleShare, 0)} in ${ROLE_LABELS[c.role]}` : "—"}</td>
                      <td className="py-1.5 pr-3">{c.confidenceWord}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            </>
          )}
        </div>
        <p className="text-xs text-fg-subtle">
          From {report.accounts.length} linked account{report.accounts.length === 1 ? "" : "s"}: every stored game, mastery and rank. Each game counts once.
          {report.lastSyncAt ? ` Updated ${timeAgo(report.lastSyncAt)}.` : ""}
        </p>
        <p className="text-xs text-fg-subtle">
          How this is used: proficiency rates each pool champion on the Team cards and the profile (a main, out of practice, a few games). It never changes the pools, and a champion not in a pool is never recommended.
          {admin ? (
            <>
              {" "}
              <Link href="/admin/data" className="underline-offset-2 hover:underline">
                Data &amp; Riot
              </Link>{" "}
              runs the account sync.
            </>
          ) : null}
        </p>
      </PanelBody>
    </Panel>
  );
}

/** A figure in the phone list's line: primary, as the table's cells are; the words around it stay secondary. */
function Figure({ children }: { children: React.ReactNode }) {
  return <span className="font-medium tabular-nums text-fg">{children}</span>;
}

/**
 * The experience label, with why it was given one press away: the shared breakdown (BreakdownPopover,
 * docs/DESIGN_SYSTEM.md), headed by the label: the tier's rule in one sentence, then the estimate's
 * notes, one a line. Too many concepts for an InfoTip (up to six sentences: the volume, the recent
 * games, results, Normal games' weight, mastery across accounts). 44px on a touch screen.
 */
export function TierWhy({ tier, label, notes }: { tier: ProficiencyTier; label: string; notes: string[] }) {
  return (
    <BreakdownPopover
      trigger={<Badge tone={TIER_TONE[tier]}>{label}</Badge>}
      triggerLabel={`${label}: why`}
      // The badge is the trigger, in the line's height; a finger's 44px band on a touch screen
      // (touch-target: past the badge, not the row's height).
      bare
      triggerClassName="touch-target -my-1 inline-flex min-h-6 items-center rounded-sm"
      title={label}
      testId="tier-why"
      panelTestId="tier-why-breakdown"
      widthClassName="w-[min(26rem,calc(100%-1rem))]"
    >
      <p className="text-sm text-fg-muted">{TIER_DESCRIPTIONS[tier]}</p>
      {notes.length ? (
        <ul className="mt-3 space-y-1.5 text-sm text-fg" data-testid="tier-why-notes">
          {notes.map((n) => (
            <li key={n}>{n}.</li>
          ))}
        </ul>
      ) : null}
    </BreakdownPopover>
  );
}
