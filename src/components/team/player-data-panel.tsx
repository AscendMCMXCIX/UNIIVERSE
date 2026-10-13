import Link from "next/link";
import type { PlayerDataReport } from "@/server/proficiency/provenance";
import { TIER_DESCRIPTIONS, type ProficiencyTier } from "@/domain/proficiency";
import { ROLE_LABELS } from "@/domain/roles";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { Info, Metric, MetricLabel, SourceLine } from "@/components/ui/metric";
import { metricTooltip } from "@/domain/metrics";
import { percent, timeAgo } from "@/lib/format";

const TIER_TONE: Record<ProficiencyTier, BadgeTone> = { core: "good", strong: "good", comfortable: "info", moderate: "neutral", rusty: "warn", unknown: "neutral" };

/**
 * RIOT DATA: what UNIIVERSE knows about this player from their linked accounts, where it came
 * from and how fresh it is, plus the per-champion proficiency the draft engine reads. The admin
 * view adds raw sync diagnostics (never PUUIDs).
 */
export function PlayerDataPanel({ report, championsById, admin = false, playerName, selfView = false }: { report: PlayerDataReport; championsById: Record<string, PortraitChampion>; admin?: boolean; playerName: string; selfView?: boolean }) {
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const summaryTone: BadgeTone = report.summary.state === "synced" ? "good" : report.summary.state === "error" ? "bad" : report.summary.state === "stale" ? "warn" : "neutral";
  return (
    <Panel>
      <PanelHeader
        title="RIOT DATA"
        subtitle={`What the draft engine knows about ${selfView ? "you" : playerName} from linked Riot accounts. Pools decide what is legal; this data only shifts preference among legal champions.`}
        actions={<Badge tone={summaryTone}>{report.summary.label}</Badge>}
      />
      <PanelBody className="space-y-4">
        <div>
          <SectionLabel className="mb-1.5">Accounts</SectionLabel>
          {report.accounts.length === 0 ? <p className="text-xs text-fg-muted">No Riot account linked yet. Link one below so proficiency can be measured.</p> : null}
          <div className="space-y-1.5">
            {report.accounts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs">
                <span className="font-medium text-fg">{a.riotId}</span>
                <Badge tone="neutral" title={a.platformSource === "riot" ? "Server confirmed by Riot's account records" : "Server as selected at sign-up; Riot has not confirmed it yet"}>
                  {a.platformLabel}
                  {a.platformSource === "riot" ? " ✓" : ""}
                </Badge>
                {a.label !== "main" ? <Badge tone="neutral">{a.label}</Badge> : null}
                {a.rank ? <Badge tone="info">{a.rank}</Badge> : null}
                <Badge tone={a.sync.tone} title={a.sync.detail}>
                  {a.sync.label}
                </Badge>
                <span className="text-fg-subtle">Last updated {a.sync.lastUpdatedAt ? timeAgo(a.sync.lastUpdatedAt) : "never"}</span>
                <span className="w-full text-fg-muted">{a.sync.detail}</span>
                {admin ? (
                  <span className="w-full font-mono text-[10px] text-fg-subtle">
                    diagnostic · status={a.rawStatus} · matches folded={a.matchesFolded} · history rows={a.historyRows} · mastery rows={a.masteryRows} · resolve attempts={a.resolveAttempts} · resolved {a.resolvedAt ? timeAgo(a.resolvedAt) : "no"} · server source={a.platformSource}
                    {a.rawError ? ` · last error: ${a.rawError}` : ""}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric id="games-on-record" value={report.gamesAnalysed.toLocaleString()} />
          <Metric id="patch-games" value={report.currentPatchGames.toLocaleString()} />
          <div className="rounded-md border border-border bg-bg-elevated px-2.5 py-1.5">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Champions with data <Info text="Champions on which at least one game or mastery record exists across the linked accounts." />
            </div>
            <div className="text-sm font-semibold text-fg">{report.championsWithData}</div>
          </div>
          <div className="rounded-md border border-border bg-bg-elevated px-2.5 py-1.5">
            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              Last sync <Info text="Most recent successful or attempted refresh of any linked account. Accounts refresh automatically every few hours." />
            </div>
            <div className="text-sm font-semibold text-fg">{report.lastSyncAt ? timeAgo(report.lastSyncAt) : "never"}</div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <SectionLabel>Champion proficiency</SectionLabel>
            <Info text={metricTooltip("proficiency-tier")} />
          </div>
          {report.champions.length === 0 ? (
            <p className="text-xs text-fg-muted">{report.accounts.length === 0 ? "Link a Riot account to see per-champion proficiency." : "No champion data yet. It appears after the first sync completes (a few minutes after linking, then every few hours)."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-fg-subtle">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Champion</th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="proficiency-tier">Proficiency</MetricLabel></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="recent-games">Recent (30d)</MetricLabel></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="patch-games">This patch</MetricLabel></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="games-on-record">On record</MetricLabel></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="last-played" /></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="mastery-points" /></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="role-usage" /></th>
                    <th className="py-1 pr-3 font-medium"><MetricLabel id="proficiency-confidence" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.champions.map((c) => (
                    <tr key={c.championId} className="align-middle">
                      <td className="py-1.5 pr-3">
                        <span className="flex items-center gap-2">
                          <ChampionPortrait champion={champ(c.championId)} size="xs" />
                          <span className="font-medium text-fg">{champ(c.championId).name}</span>
                          {c.inPool ? (
                            <span className="flex items-center gap-0.5 text-fg-subtle" title={`${c.inPool === "primary" ? "Primary" : "Secondary"} pool · ${ROLE_LABELS[c.role]}`}>
                              <RoleIcon role={c.role} className="h-3 w-3" />
                              {c.inPool === "secondary" ? <span className="text-[10px]">2nd</span> : null}
                            </span>
                          ) : (
                            <span className="text-[10px] text-fg-subtle" title="Played on linked accounts but not in a configured pool: never recommended until added to a pool.">not in pool</span>
                          )}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge tone={TIER_TONE[c.tier]} title={`${TIER_DESCRIPTIONS[c.tier]}${c.notes.length ? ` ${c.notes.join(". ")}.` : ""}`}>
                          {c.tierLabel}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-3">{c.recentGames}</td>
                      <td className="py-1.5 pr-3">{c.patchGames}</td>
                      <td className="py-1.5 pr-3">{c.games}</td>
                      <td className="py-1.5 pr-3 text-fg-muted">{c.lastPlayedAt ? timeAgo(c.lastPlayedAt) : "—"}</td>
                      <td className="py-1.5 pr-3 text-fg-muted">{c.mastery ? `${c.mastery.points.toLocaleString()} pts · M${c.mastery.level}` : "—"}</td>
                      <td className="py-1.5 pr-3 text-fg-muted">{c.games > 0 ? `${percent(c.roleShare, 0)} in ${ROLE_LABELS[c.role]}` : "—"}</td>
                      <td className="py-1.5 pr-3 text-fg-muted">{c.confidenceWord}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <SourceLine source="Riot match history (ranked, normal and Clash), champion mastery and ranked tier for each linked account; games are deduplicated per account by match id and accounts are distinct Riot identities, so a game is never counted twice" population={`${report.accounts.length} linked account${report.accounts.length === 1 ? "" : "s"} · roughly the last four months of games${report.currentPatch ? ` · current patch ${report.currentPatch}` : ""}`} updated={report.lastSyncAt ? timeAgo(report.lastSyncAt) : null} />
        <p className="text-[11px] text-fg-subtle">
          How this is used: during a draft, every legal champion gets a small preference shift from proficiency (very strong up, rusty or thin data down), explained in the recommendation&apos;s <em>Why this pick?</em> breakdown. It never overrides pools, matchups or team structure.
          {admin ? (
            <>
              {" "}
              <Link href="/settings" className="underline-offset-2 hover:underline">
                Data jobs
              </Link>{" "}
              runs the account sync.
            </>
          ) : null}
        </p>
      </PanelBody>
    </Panel>
  );
}
