import Link from "next/link";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { listOpponentTeams } from "@/server/repositories/opponents";
import { getOrCreateTeam } from "@/server/repositories/team";
import { NewOpponentForm } from "@/components/opponents/opponent-form";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpponentsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const { archived } = await searchParams;
  const db = await getAppDb();
  const [team, session] = await Promise.all([getOrCreateTeam(db), getSession()]);
  const opponents = await listOpponentTeams(db, team.id, { includeArchived: archived === "1" });
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">Opponents</h1>
          <p className="text-sm text-fg-muted">Optional scouting notes and known accounts. Nothing here is required to draft.</p>
        </div>
        <Link href={archived === "1" ? "/opponents" : "/opponents?archived=1"} className="text-xs text-fg-muted hover:text-fg">
          {archived === "1" ? "Hide archived" : "Show archived"}
        </Link>
      </div>
      {hasPermission(session, "manage-opponents") ? (
        <Panel>
          <PanelBody>
            <NewOpponentForm />
          </PanelBody>
        </Panel>
      ) : null}
      <Panel>
        <PanelHeader title="RECENT OPPONENTS" subtitle={`${opponents.length} saved`} />
        <PanelBody className="divide-y divide-border p-0">
          {opponents.length === 0 ? <p className="px-4 py-3 text-sm text-fg-muted">No opponents saved yet.</p> : null}
          {opponents.map((o) => (
            <Link key={o.id} href={`/opponents/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{o.name}</div>
                <div className="truncate text-xs text-fg-subtle">{o.aliases.length ? `aka ${o.aliases.join(", ")} · ` : ""}updated {timeAgo(o.updatedAt)}</div>
              </div>
              <Badge tone="neutral">{o.playerCount} players</Badge>
              <Badge tone={o.matchCount > 0 ? "info" : "neutral"}>{o.matchCount} meetings</Badge>
              {o.archivedAt ? <Badge tone="warn">archived</Badge> : null}
            </Link>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}
