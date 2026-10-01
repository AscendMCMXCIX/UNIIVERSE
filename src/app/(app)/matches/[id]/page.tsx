import Link from "next/link";
import { notFound } from "next/navigation";
import { competitionModeLabel } from "@/domain/competition";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import type { Playbook } from "@/domain/playbook";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getMatch } from "@/server/matches/repository";
import { previousMeetings } from "@/server/repositories/opponents";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { MatchEditor } from "@/components/matches/match-editor";
import { PlaybookPanel } from "@/components/playbook/playbook-panel";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getAppDb();
  const [match, session, champions] = await Promise.all([getMatch(db, id), getSession(), listChampions(db)]);
  if (!match) notFound();
  const meetings = match.opponentTeamId ? (await previousMeetings(db, match.opponentTeamId, 10)).filter((m) => m.id !== match.id) : [];
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (cid: string | null) => (cid ? championsById[cid] ?? { id: cid, name: cid, portraitUrl: "" } : null);
  const playerName = (pid: string | null) => match.lineupSnapshot.find((p) => p.id === pid)?.displayName ?? "?";
  const canEdit = hasPermission(session, "manage-matches");
  const isOwner = session?.role === "owner";
  const playbook = match.playbook && (match.playbook as { version?: number }).version === 2 ? (match.playbook as unknown as Playbook) : null;
  const ourByRole = new Map(match.ourPicks.map((p) => [p.role, p]));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/matches" className="text-xs text-fg-muted hover:text-fg">
          ← Matches
        </Link>
        <h1 className="text-xl font-bold">
          vs {match.opponentName || "Unnamed opponent"} <span className="ml-2 text-sm font-normal text-fg-subtle">{formatDate(match.playedAt)} · patch {match.patch}</span>
        </h1>
        <Badge tone="neutral">{competitionModeLabel(match.mode)}</Badge>
        <Badge tone={match.side === "blue" ? "blue" : "red"}>{match.side} side</Badge>
        <Badge tone={match.result === "win" ? "good" : match.result === "loss" ? "bad" : "neutral"}>{match.result ?? "no result"}</Badge>
        {match.eventName ? <Badge tone="accent">{match.eventName}</Badge> : null}
        <span className="flex-1" />
        {match.draftId ? (
          <Link href={`/draft/${match.draftId}`} className="text-xs text-accent hover:underline">
            open the draft
          </Link>
        ) : (
          <span className="text-xs text-fg-subtle">draft deleted; record kept</span>
        )}
        {match.opponentTeamId ? (
          <Link href={`/opponents/${match.opponentTeamId}`} className="text-xs text-accent hover:underline">
            opponent page
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="DRAFT" subtitle="Final picks and bans as entered." />
            <PanelBody className="grid gap-4 md:grid-cols-2">
              <div>
                <SectionLabel className="mb-1">UNIIVERSE</SectionLabel>
                <div className="mb-2 flex gap-1">{match.ourBans.map((b, i) => <ChampionPortrait key={i} champion={champ(b)} size="sm" dimmed className="grayscale" />)}</div>
                <div className="space-y-1">
                  {ROLES.map((role) => {
                    const p = ourByRole.get(role);
                    return (
                      <div key={role} className="flex items-center gap-2 text-sm">
                        <RoleIcon role={role} className="h-3.5 w-3.5 text-accent" />
                        <ChampionPortrait champion={champ(p?.championId ?? null)} size="sm" />
                        <span className="font-medium">{champ(p?.championId ?? null)?.name ?? "—"}</span>
                        <span className="text-xs text-fg-subtle">{playerName(p?.playerId ?? match.finalAssignments[role as Role])}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <SectionLabel className="mb-1">{match.opponentName || "Enemy"}</SectionLabel>
                <div className="mb-2 flex gap-1">{match.enemyBans.map((b, i) => <ChampionPortrait key={i} champion={champ(b)} size="sm" dimmed className="grayscale" />)}</div>
                <div className="space-y-1">
                  {match.enemyPicks.map((p) => (
                    <div key={p.index} className="flex items-center gap-2 text-sm">
                      <ChampionPortrait champion={champ(p.championId)} size="sm" />
                      <span className="font-medium">{champ(p.championId)?.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </PanelBody>
          </Panel>
          {playbook ? <PlaybookPanel playbook={playbook} championsById={championsById} title="PLAYBOOK (AS DRAFTED)" /> : null}
          {match.riotInfo ? (
            <Panel>
              <PanelHeader title="RIOT MATCH" subtitle={`${match.riotMatchId} · ${(match.riotInfo as { gameVersion?: string }).gameVersion ?? ""}`} />
              <PanelBody className="text-xs text-fg-muted">
                {((match.riotInfo as { participants?: Array<{ teamId: number; championName: string; position: string; kills: number; deaths: number; assists: number; win: boolean }> }).participants ?? []).map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <span className={p.teamId === 100 ? "text-blue" : "text-red"}>{p.teamId === 100 ? "blue" : "red"}</span>
                    <span className="w-28">{p.championName}</span>
                    <span className="w-16">{p.position}</span>
                    <span>
                      {p.kills}/{p.deaths}/{p.assists}
                    </span>
                  </div>
                ))}
              </PanelBody>
            </Panel>
          ) : null}
        </div>
        <div className="space-y-4">
          <MatchEditor match={{ id: match.id, result: match.result, durationSeconds: match.durationSeconds, riotMatchId: match.riotMatchId, notes: match.notes, vodUrl: match.vodUrl, playedAt: match.playedAt.toISOString(), eventName: match.eventName }} canEdit={canEdit} isOwner={isOwner} riotConfigured={!!process.env.RIOT_API_KEY} />
          <Panel>
            <PanelHeader title="LINEUP" />
            <PanelBody className="space-y-1 text-sm">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <RoleIcon role={role} className="h-3.5 w-3.5 text-fg-subtle" />
                  <span className="w-16 text-xs text-fg-subtle">{ROLE_LABELS[role]}</span>
                  <span>{playerName(match.finalAssignments[role as Role])}</span>
                </div>
              ))}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="PREVIOUS MEETINGS" subtitle="Same opponent, reference only." />
            <PanelBody className="divide-y divide-border p-0">
              {meetings.length === 0 ? <p className="px-4 py-3 text-xs text-fg-muted">No other saved matches against this opponent.</p> : null}
              {meetings.map((m) => (
                <Link key={m.id} href={`/matches/${m.id}`} className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-surface-2">
                  <span className="w-24 text-fg-subtle">{formatDate(m.playedAt)}</span>
                  <Badge tone={m.result === "win" ? "good" : m.result === "loss" ? "bad" : "neutral"}>{m.result ?? "no result"}</Badge>
                  <div className="flex gap-0.5">{m.ourPicks.map((p) => <ChampionPortrait key={p.index} champion={champ(p.championId)} size="xs" />)}</div>
                </Link>
              ))}
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
