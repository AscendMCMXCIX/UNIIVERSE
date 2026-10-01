import Link from "next/link";
import { getAppDb } from "@/server/bootstrap";
import { listChampions } from "@/server/repositories/champions";
import { listDrafts } from "@/server/repositories/drafts";
import { getCurrentLineup, getOrCreateTeam } from "@/server/repositories/team";
import { NewDraftForm } from "@/components/draft/new-draft-form";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DraftListPage() {
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [lineup, drafts, champions] = await Promise.all([getCurrentLineup(db, team.id), listDrafts(db, team.id), listChampions(db)]);
  const byId = new Map(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">Draft</h1>
        <p className="text-sm text-fg-muted">Live tournament drafting with recommendations built around the active lineup.</p>
      </div>
      <NewDraftForm lineupReady={lineup.isComplete} />
      <Panel>
        <PanelHeader title="DRAFT HISTORY" subtitle={`${drafts.length} saved`} />
        <PanelBody className="divide-y divide-border p-0">
          {drafts.length === 0 ? <p className="px-4 py-3 text-sm text-fg-muted">No drafts yet.</p> : null}
          {drafts.map((d) => (
            <Link key={d.id} href={`/draft/${d.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2">
              <div className="w-40 min-w-0">
                <div className="truncate text-sm font-semibold">{d.opponentName || "Unnamed opponent"}</div>
                <div className="text-xs text-fg-subtle">
                  {formatDate(d.createdAt)} · patch {d.patch}
                </div>
              </div>
              <Badge tone={d.side === "blue" ? "blue" : "red"}>{d.side}</Badge>
              <Badge tone={d.status === "completed" ? "good" : d.status === "abandoned" ? "neutral" : "warn"}>{d.status === "in_progress" ? `${d.progress}/20` : d.status}</Badge>
              <div className="flex items-center gap-1">
                {d.ourPicks.map((id) => (
                  <ChampionPortrait key={id} champion={byId.get(id) ?? { id, name: id, portraitUrl: "" }} size="xs" />
                ))}
              </div>
              <span className="text-xs text-fg-subtle">vs</span>
              <div className="flex items-center gap-1">
                {d.enemyPicks.map((id) => (
                  <ChampionPortrait key={id} champion={byId.get(id) ?? { id, name: id, portraitUrl: "" }} size="xs" dimmed />
                ))}
              </div>
            </Link>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}
