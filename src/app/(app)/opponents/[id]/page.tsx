import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getOpponentTeam, previousMeetings } from "@/server/repositories/opponents";
import { loadScoutedTeam } from "@/server/scouting/service";
import { assessScouting, likelyPicks } from "@/domain/scouting";
import { loadStatsProvider } from "@/server/stats/loader";
import { getChampionMap } from "@/server/engine/service";
import { competitionModeLabel } from "@/domain/competition";
import { OpponentDetailsForm } from "@/components/opponents/opponent-form";
import { OpponentPlayers } from "@/components/opponents/opponent-players";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OpponentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getAppDb();
  const [team, session, champions, scouted] = await Promise.all([getOpponentTeam(db, id), getSession(), listChampions(db), loadScoutedTeam(db, id)]);
  if (!team || !scouted) notFound();
  const [stats, championMap, meetings] = await Promise.all([loadStatsProvider(db), getChampionMap(db), previousMeetings(db, id)]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (cid: string) => championsById[cid] ?? { id: cid, name: cid, portraitUrl: "" };
  const canManage = hasPermission(session, "manage-opponents");
  const views = scouted.players.map((p) => {
    const a = assessScouting(p);
    return { player: p, assessment: a, picks: likelyPicks(p, stats, championMap) };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/opponents" className="text-xs text-fg-muted hover:text-fg">
          ← Opponents
        </Link>
        <h1 className="text-xl font-bold">{team.name}</h1>
        {team.archivedAt ? <Badge tone="warn">archived</Badge> : null}
      </div>
      {canManage ? <OpponentDetailsForm opponent={{ id: team.id, name: team.name, aliases: team.aliases, notes: team.notes, archivedAt: team.archivedAt }} /> : null}
      {canManage ? (
        <OpponentPlayers
          opponentTeamId={team.id}
          riotConfigured={!!process.env.RIOT_API_KEY}
          players={views.map(({ player, assessment }) => ({ id: player.id, label: player.label, likelyRole: player.likelyRole, altRole: player.altRole, confidence: player.identityConfidence, notes: player.notes, accounts: scouted.accountsByPlayer[player.id] ?? [], assessment: { confidence: assessment.confidence, factors: assessment.factors, anomaly: assessment.anomaly } }))}
        />
      ) : null}
      <Panel>
        <PanelHeader title="SCOUTING SUMMARY" subtitle="Likely picks from linked-account history; confidence reflects identity, recency and sample size." />
        <PanelBody className="space-y-3">
          {views.length === 0 ? <p className="text-sm text-fg-muted">No players recorded.</p> : null}
          {views.map(({ player, assessment, picks }) => (
            <div key={player.id} className="flex flex-wrap items-center gap-2">
              <span className="w-40 truncate text-sm font-medium">{player.label}</span>
              <Badge tone={assessment.confidence === "high" ? "good" : assessment.confidence === "medium" ? "info" : "neutral"}>{assessment.confidence}</Badge>
              {assessment.anomaly.level !== "none" ? <Badge tone="warn" title={assessment.anomaly.notes.join(" · ")}>{assessment.anomaly.notes[0]}</Badge> : null}
              <div className="flex items-center gap-1">
                {picks.length === 0 ? <span className="text-xs text-fg-subtle">no history yet</span> : null}
                {picks.map((p) => (
                  <div key={p.championId} title={`${champ(p.championId).name} · ${p.proficiency.tier} · ${p.proficiency.games} games`}>
                    <ChampionPortrait champion={champ(p.championId)} size="sm" />
                  </div>
                ))}
              </div>
              {assessment.factors.length ? <span className="text-xs text-fg-subtle">{assessment.factors.join(" · ")}</span> : null}
            </div>
          ))}
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="PREVIOUS MEETINGS" subtitle="Reference only: current scouting is always based on current data." />
        <PanelBody className="divide-y divide-border p-0">
          {meetings.length === 0 ? <p className="px-4 py-3 text-sm text-fg-muted">No saved matches against this opponent yet.</p> : null}
          {meetings.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-2">
              <span className="w-28 text-xs text-fg-subtle">{formatDate(m.playedAt)}</span>
              <Badge tone="neutral">{competitionModeLabel(m.mode)}</Badge>
              <Badge tone={m.result === "win" ? "good" : m.result === "loss" ? "bad" : "neutral"}>{m.result ?? "no result"}</Badge>
              <div className="flex items-center gap-1">{m.ourPicks.map((p) => <ChampionPortrait key={p.championId} champion={champ(p.championId)} size="xs" />)}</div>
              <span className="text-xs text-fg-subtle">vs</span>
              <div className="flex items-center gap-1">{m.enemyPicks.map((p) => <ChampionPortrait key={p.championId} champion={champ(p.championId)} size="xs" dimmed />)}</div>
            </Link>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}
