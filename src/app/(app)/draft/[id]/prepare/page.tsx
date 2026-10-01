import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { COMPETITION_MODE_INFO } from "@/domain/competition";
import { ROLE_LABELS } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getDraft } from "@/server/repositories/drafts";
import { listOpponentTeams, previousMeetings } from "@/server/repositories/opponents";
import { preDraftForDraft } from "@/server/predraft/service";
import { assessScouting } from "@/domain/scouting";
import { PlanView } from "@/components/predraft/plan-view";
import { OpponentPlayers } from "@/components/opponents/opponent-players";
import { NewOpponentForm } from "@/components/opponents/opponent-form";
import { AttachOpponent } from "@/components/predraft/attach-opponent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Pre-draft preparation: blind bans for Ranked Flex, scouting window for Clash/organised play. */
export default async function PreparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getAppDb();
  const [draft, session, champions] = await Promise.all([getDraft(db, id), getSession(), listChampions(db)]);
  if (!draft) notFound();
  const { plan, scouted } = await preDraftForDraft(db, draft);
  const opponents = await listOpponentTeams(db, draft.teamId);
  const meetings = draft.opponentTeamId ? await previousMeetings(db, draft.opponentTeamId, 5) : [];
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const playerNames = Object.fromEntries(draft.lineup.map((p) => [p.id, p.displayName]));
  const info = COMPETITION_MODE_INFO[draft.mode];
  const canScout = hasPermission(session, "manage-opponents");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-fg-subtle">Pre-draft</div>
          <h1 className="text-xl font-bold">
            {info.label}
            {draft.eventName ? ` · ${draft.eventName}` : ""}
            {draft.opponentName ? ` · vs ${draft.opponentName}` : ""}
          </h1>
        </div>
        <Badge tone={draft.side === "blue" ? "blue" : "red"}>{draft.side} side</Badge>
        {draft.isTheorycraft ? <Badge tone="accent">THEORYCRAFT</Badge> : null}
        <span className="flex-1" />
        <Link href={`/draft/${draft.id}`}>
          <Button variant="primary" size="lg">
            Open draft room <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
      <p className="text-sm text-fg-muted">
        Lineup: {draft.lineup.map((p) => `${p.displayName} (${ROLE_LABELS[(Object.entries(draft.currentAssignments).find(([, pid]) => pid === p.id)?.[0] ?? p.primaryRole) as keyof typeof ROLE_LABELS]})`).join(" · ")}
      </p>

      {info.scouting !== "none" ? (
        <Panel className="border-info/40">
          <PanelHeader title={draft.mode === "clash" ? "CLASH SCOUTING WINDOW" : "OPPONENT SCOUTING"} subtitle="Optional. Add whatever you receive before the draft; everything below updates as you type." />
          <PanelBody className="space-y-3">
            {!scouted ? (
              <div className="flex flex-wrap items-end gap-4">
                {canScout ? <NewOpponentForm draftId={draft.id} compact /> : null}
                {opponents.length > 0 && canScout ? <AttachOpponent draftId={draft.id} opponents={opponents.map((o) => ({ id: o.id, name: o.name }))} /> : null}
                {!canScout ? <p className="text-xs text-fg-muted">A coach or owner can attach an opponent.</p> : null}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{scouted.team.name}</span>
                  <Link href={`/opponents/${scouted.team.id}`} className="text-xs text-accent hover:underline">
                    open opponent page
                  </Link>
                  {meetings.length > 0 ? <span className="text-xs text-fg-subtle">· {meetings.length} previous meeting{meetings.length === 1 ? "" : "s"}: {meetings.map((m) => `${formatDate(m.playedAt)} ${m.result ?? "?"}`).join(", ")}</span> : null}
                </div>
                {canScout ? (
                  <OpponentPlayers
                    opponentTeamId={scouted.team.id}
                    riotConfigured={!!process.env.RIOT_API_KEY}
                    compact
                    players={scouted.players.map((p) => {
                      const a = assessScouting(p);
                      return { id: p.id, label: p.label, likelyRole: p.likelyRole, altRole: p.altRole, confidence: p.identityConfidence, notes: p.notes, accounts: scouted.accountsByPlayer[p.id] ?? [], assessment: { confidence: a.confidence, factors: a.factors, anomaly: a.anomaly } };
                    })}
                  />
                ) : null}
              </>
            )}
          </PanelBody>
        </Panel>
      ) : null}

      <PlanView plan={plan} championsById={championsById} playerNames={playerNames} />
    </div>
  );
}
