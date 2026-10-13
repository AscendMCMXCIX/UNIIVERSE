"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import type { EnemyTendencies } from "@/domain/engine/tendencies";
import type { EnemyScoutingView } from "@/server/scouting/session";
import { rescoutEnemiesAction } from "@/server/actions/drafts";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Info } from "@/components/ui/metric";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";

const LIKELIHOOD: Record<"high" | "moderate" | "low", { label: string; tone: BadgeTone }> = {
  high: { label: "High likelihood", tone: "bad" },
  moderate: { label: "Moderate likelihood", tone: "warn" },
  low: { label: "Low likelihood", tone: "neutral" },
};

/**
 * What is known about the enemy players entered for this draft: likely picks per role with a
 * plain likelihood and a confidence, plus the lookup status. Partial rosters are normal.
 */
export function EnemyTendenciesPanel({ draftId, tendencies, scouting, championsById, canEdit, compact = false }: { draftId: string; tendencies: EnemyTendencies | null; scouting: EnemyScoutingView[]; championsById: Record<string, PortraitChampion>; canEdit: boolean; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const roles = ROLES.filter((r) => scouting.some((s) => s.role === r) || tendencies?.[r]);
  if (roles.length === 0) return null;
  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    const r = await rescoutEnemiesAction(draftId);
    setBusy(false);
    setMessage(r.ok ? `${r.data.scouted + r.data.reused} player${r.data.scouted + r.data.reused === 1 ? "" : "s"} scouted${r.data.pending ? `, ${r.data.pending} pending` : ""}${r.data.unresolved ? `, ${r.data.unresolved} not found` : ""}.` : r.error);
    router.refresh();
  };
  return (
    <Panel>
      <PanelHeader
        title="ENEMY LIKELY PICKS"
        subtitle={compact ? "From the Riot IDs entered for this draft; unknown players use global evidence." : "Session scouting from the enemy Riot IDs entered for this draft. Known players shift close ban and pick decisions; unknown roles use global evidence."}
        actions={canEdit ? <Button size="sm" variant="ghost" disabled={busy} onClick={refresh}><RefreshCw className="h-3.5 w-3.5" /> {busy ? "Scouting…" : "Refresh scouting"}</Button> : null}
      />
      <PanelBody className="space-y-3">
        {roles.map((role: Role) => {
          const t = tendencies?.[role];
          const s = scouting.find((x) => x.role === role);
          return (
            <div key={role} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <RoleIcon role={role} className="h-4 w-4 text-accent" />
                <span className="font-semibold">Enemy {ROLE_LABELS[role]}</span>
                <span className="text-fg-muted">{s?.riotId ?? t?.label}</span>
                {s?.rank ? <Badge tone="info">{s.rank}</Badge> : null}
                {t ? (
                  <span className="inline-flex items-center gap-1">
                    <Badge tone={t.confidenceLabel === "high" ? "good" : t.confidenceLabel === "medium" ? "info" : "neutral"}>{t.confidenceLabel} confidence</Badge>
                    <Info text={`Scouting confidence ${Math.round(t.confidence * 100)}%: ${t.factors.length ? t.factors.join("; ") : "resolved Riot ID, recent games on record"}. ${t.gamesAnalysed} recent ranked games analysed.`} />
                  </span>
                ) : s?.status === "pending" ? (
                  <Badge tone="neutral" title={s.error ?? undefined}>Scouting pending</Badge>
                ) : s?.status === "unresolved" ? (
                  <Badge tone="warn" title={s.error ?? undefined}>Riot ID not found</Badge>
                ) : s?.status === "failed" ? (
                  <Badge tone="bad" title={s.error ?? undefined}>Lookup failed</Badge>
                ) : null}
                {s?.fetchedAt ? <span className="text-[11px] text-fg-subtle">scouted {timeAgo(s.fetchedAt)}</span> : null}
              </div>
              {t && t.picks.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {t.picks.slice(0, compact ? 4 : 6).map((p) => (
                    <div key={p.championId} className="flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-1.5 py-1" title={`${champ(p.championId).name}: ${p.recentGames} games in the last 30 days, ${p.games} in the sample${p.patchGames ? `, ${p.patchGames} this patch` : ""}`}>
                      <ChampionPortrait champion={champ(p.championId)} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium">{champ(p.championId).name}</div>
                        <Badge tone={LIKELIHOOD[p.likelihood].tone}>{LIKELIHOOD[p.likelihood].label}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : t ? (
                <p className="text-xs text-fg-muted">No recent ranked games found for this player; global evidence is used.</p>
              ) : s?.error ? (
                <p className="text-xs text-fg-muted">{s.error}</p>
              ) : null}
            </div>
          );
        })}
        {message ? <p className="text-xs text-fg-muted">{message}</p> : null}
      </PanelBody>
    </Panel>
  );
}
