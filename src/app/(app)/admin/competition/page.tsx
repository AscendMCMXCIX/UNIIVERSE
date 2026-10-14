import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listChangePoints } from "@/server/repositories/champions";
import { BUILTIN_FORMATS } from "@/domain/draft";
import { COMPETITION_MODE_INFO, DRAFT_MODE_OPTIONS } from "@/domain/competition";
import type { EngineConfig } from "@/domain/engine";
import { ChangePointsPanel, EnginePanel } from "@/components/settings/settings-panels";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/** Competition & Draft: the predefined draft templates (read-only), engine weights and pool limits, champion rework handling. */
export default async function AdminCompetitionPage() {
  await requirePageAccess("manage-competition");
  const db = await getAppDb();
  const [team, changePoints] = await Promise.all([getOrCreateTeam(db), listChangePoints(db)]);
  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader title="DRAFT TEMPLATES" subtitle="Each competition mode uses a predefined pick and ban order. There is nothing to configure; saved drafts keep the format they were played with." />
        <PanelBody>
          <ul className="space-y-2 text-sm" data-testid="draft-templates">
            {Object.values(BUILTIN_FORMATS).map((f) => (
              <li key={f.id} className="rounded-md border border-border bg-bg-elevated px-3 py-2">
                <div className="font-medium text-fg">{f.name}</div>
                <div className="text-xs text-fg-muted">{f.description}</div>
                <div className="mt-1 text-xs text-fg-subtle">
                  Used by: {DRAFT_MODE_OPTIONS.filter((m) => COMPETITION_MODE_INFO[m].defaultFormatId === f.id).map((m) => COMPETITION_MODE_INFO[m].label).join(", ") || "selectable for organised games"}
                </div>
              </li>
            ))}
          </ul>
        </PanelBody>
      </Panel>
      <EnginePanel config={team.engineConfig as Partial<EngineConfig>} poolLimits={team.poolLimits} isOwner />
      <ChangePointsPanel items={changePoints.map((c) => ({ id: c.id, championId: c.championId, patch: c.patch, discount: c.discount, reason: c.reason, source: c.source, confirmed: c.confirmed }))} isOwner />
    </div>
  );
}
