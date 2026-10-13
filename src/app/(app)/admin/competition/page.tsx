import { getAppDb } from "@/server/bootstrap";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listChangePoints } from "@/server/repositories/champions";
import { getCustomFormats } from "@/server/repositories/formats";
import { BUILTIN_FORMATS } from "@/domain/draft";
import type { EngineConfig } from "@/domain/engine";
import { FormatsPanel } from "@/components/settings/formats-panel";
import { ChangePointsPanel, EnginePanel } from "@/components/settings/settings-panels";

export const dynamic = "force-dynamic";

/** Competition & Draft: draft formats, engine weights and pool limits, champion rework handling. */
export default async function AdminCompetitionPage() {
  const db = await getAppDb();
  const [team, customFormats, changePoints] = await Promise.all([getOrCreateTeam(db), getCustomFormats(db), listChangePoints(db)]);
  return (
    <div className="space-y-5">
      <FormatsPanel builtin={Object.values(BUILTIN_FORMATS)} custom={customFormats} isOwner />
      <EnginePanel config={team.engineConfig as Partial<EngineConfig>} poolLimits={team.poolLimits} isOwner />
      <ChangePointsPanel items={changePoints.map((c) => ({ id: c.id, championId: c.championId, patch: c.patch, discount: c.discount, reason: c.reason, source: c.source, confirmed: c.confirmed }))} isOwner />
    </div>
  );
}
