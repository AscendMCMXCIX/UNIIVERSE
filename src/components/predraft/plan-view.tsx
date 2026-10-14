import { ROLE_LABELS, ROLES } from "@/domain/roles";
import type { PreDraftPlan } from "@/domain/predraft";
import type { PortraitChampion } from "@/components/champion-portrait";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";

export interface PlanViewProps {
  plan: PreDraftPlan;
  championsById: Record<string, PortraitChampion>;
  playerNames: Record<string, string>;
}

/** Presentational pre-draft plan. Server-renderable; concise enough for a five-minute window. */
export function PlanView({ plan, championsById, playerNames }: PlanViewProps) {
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="border-accent/40">
        <PanelHeader title="Ban considerations" subtitle={plan.scouting.available ? "Team-specific threats merged with scouted ban damage (confidence-weighted)." : "Built from our pools, our likely structures and current data; nobody's win rate alone."} />
        <PanelBody className="space-y-2.5">
          {plan.bans.map((b, i) => (
            <div key={b.championId} className="flex items-start gap-3">
              <div className="w-5 text-right text-xs text-fg-subtle">{i + 1}</div>
              <ChampionPortrait champion={champ(b.championId)} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                  {champ(b.championId).name}
                  {b.likelyRole ? <RoleIcon role={b.likelyRole} className="h-3.5 w-3.5 text-fg-subtle" /> : null}
                  <Badge tone={b.source === "both" ? "accent" : b.source === "scouting" ? "info" : "neutral"}>{b.source === "both" ? "team + scouting" : b.source}</Badge>
                  {b.targetLabel ? <span className="text-xs text-fg-subtle">vs {b.targetLabel}</span> : null}
                </div>
                <ul className="mt-0.5 text-xs text-fg-muted">
                  {b.reasons.slice(0, 3).map((r, j) => (
                    <li key={j}>• {r}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </PanelBody>
      </Panel>

      <div className="space-y-4">
        <Panel>
          <PanelHeader title="Expected enemy priorities" subtitle={plan.scouting.summary} />
          <PanelBody className="space-y-3">
            {plan.expectedPriorities.length === 0 ? <p className="text-xs text-fg-muted">No scouted picks. Expect current-meta priority; see the contested list on Trends.</p> : null}
            {plan.expectedPriorities.map((p) => (
              <div key={p.label} className="flex flex-wrap items-center gap-2">
                <div className="flex w-40 items-center gap-1.5 text-sm font-medium">
                  {p.role ? <RoleIcon role={p.role} className="h-4 w-4 text-accent" /> : null}
                  <span className="truncate">{p.label}</span>
                </div>
                <Badge tone={p.confidence === "high" ? "good" : p.confidence === "medium" ? "info" : "neutral"}>{p.confidence}</Badge>
                <div className="flex items-center gap-1">
                  {p.picks.map((pick) => (
                    <div key={pick.championId} title={`${champ(pick.championId).name} · ${pick.tier}`}>
                      <ChampionPortrait champion={champ(pick.championId)} size="sm" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Important flexes" subtitle="Ours come from player configuration; theirs from scouted picks playable in several roles." />
          <PanelBody className="grid gap-3 md:grid-cols-2">
            <div>
              <SectionLabel className="mb-1">Ours</SectionLabel>
              {plan.flexes.ours.length === 0 ? <p className="text-xs text-fg-muted">No genuine flex in the current pools.</p> : null}
              {plan.flexes.ours.map((f) => (
                <div key={f.championId} className="flex items-center gap-2 py-0.5 text-xs">
                  <ChampionPortrait champion={champ(f.championId)} size="xs" />
                  <span>{champ(f.championId).name}</span>
                  <span className="text-fg-subtle">{f.owners.map((o) => `${playerNames[o.playerId] ?? "?"} ${ROLE_LABELS[o.role]}`).join(" / ")}</span>
                </div>
              ))}
            </div>
            <div>
              <SectionLabel className="mb-1">Theirs</SectionLabel>
              {plan.flexes.theirs.length === 0 ? <p className="text-xs text-fg-muted">None identified.</p> : null}
              {plan.flexes.theirs.map((f) => (
                <div key={f.championId} className="flex items-center gap-2 py-0.5 text-xs">
                  <ChampionPortrait champion={champ(f.championId)} size="xs" />
                  <span>{champ(f.championId).name}</span>
                  <span className="text-fg-subtle">{f.roles.map((r) => ROLE_LABELS[r]).join(" / ")} · {f.label}</span>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Our opening routes" subtitle="Strong complete teams reachable from our pools; nothing is pre-locked." />
        <PanelBody className="space-y-3">
          {plan.routes.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                {[...r.members].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role)).map((m) => (
                  <div key={m.role} title={`${champ(m.championId).name} · ${playerNames[m.playerId] ?? ""} ${ROLE_LABELS[m.role]}`}>
                    <ChampionPortrait champion={champ(m.championId)} size="sm" />
                  </div>
                ))}
              </div>
              {r.identity ? <Badge tone="accent">{r.identity}</Badge> : null}
              <span className="text-xs text-fg-muted">{r.notes.slice(0, 2).join(" · ")}</span>
            </div>
          ))}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Pool risks" subtitle="Where later bans could pinch us, and the legal escape." />
        <PanelBody className="space-y-1.5">
          {plan.poolRisks.map((r) => (
            <div key={r.role} className="flex flex-wrap items-center gap-2 text-xs">
              <RoleIcon role={r.role} className="h-4 w-4 text-accent" />
              <span className="w-24 font-medium">{playerNames[r.playerId] ?? ROLE_LABELS[r.role]}</span>
              <Badge tone={r.options - r.threatened <= 1 ? "bad" : r.threatened >= 2 ? "warn" : "good"}>
                {r.options} options · {r.threatened} ban-prone
              </Badge>
              <span className="text-fg-muted">{r.message}</span>
              {r.escape ? <span className="text-fg-subtle">· {r.escape}</span> : null}
            </div>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}
