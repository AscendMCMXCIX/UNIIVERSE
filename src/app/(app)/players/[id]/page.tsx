import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { canEditPlayer, getSession, hasPermission } from "@/server/auth/session";
import { isSeasonMode } from "@/domain/season-stats";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { listChampions } from "@/server/repositories/champions";
import { getCurrentLineup, getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { getPlayerOverview } from "@/server/players/overview";
import { getPlayerDataReport } from "@/server/proficiency/provenance";
import { PlayerOverview } from "@/components/players/player-overview";
import { PlayerDataPanel } from "@/components/team/player-data-panel";
import { ErrorBoundary } from "@/components/error-boundary";
import { RoleIcon } from "@/components/role-icon";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

function PoolBlock({ title, role, pool, championsById }: { title: string; role: Role; pool: string[]; championsById: Record<string, PortraitChampion> }) {
  return (
    <div>
      <SectionLabel className="mb-1.5">
        {title} · {ROLE_LABELS[role]}
      </SectionLabel>
      {pool.length === 0 ? <p className="text-xs text-fg-subtle">No champions configured.</p> : null}
      <ul className="flex flex-wrap gap-2">
        {pool.map((id) => {
          const c = championsById[id] ?? { id, name: id, portraitUrl: "" };
          return (
            <li key={id} className="flex items-center gap-1.5 rounded-md border border-border bg-bg-elevated py-1 pl-1 pr-2 text-xs">
              <ChampionPortrait champion={c} size="xs" /> {c.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A player's profile as every member sees it: roles, pools, linked Riot accounts and ranked
 * statistics. Editing lives on /players/[id]/edit for the profile's owner and admins. Nothing
 * here concerns passwords, sessions or infrastructure.
 */
export default async function PlayerProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string; mode?: string; others?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await getSession();
  const db = await getAppDb();
  const [team, champions, player] = await Promise.all([getOrCreateTeam(db), listChampions(db), getPlayer(db, id)]);
  if (!player) notFound();
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const editable = canEditPlayer(session, player.id);
  const admin = hasPermission(session, "manage-players");
  const selfView = session?.playerId === player.id;
  const [lineup, overview, report] = await Promise.all([
    getCurrentLineup(db, team.id),
    getPlayerOverview(db, player, { season: Number(sp.season) || null, mode: isSeasonMode(sp.mode) ? sp.mode : "all", riotConfigured, includeOthers: sp.others === "1" }),
    getPlayerDataReport(db, player, { riotConfigured }).catch((err: Error) => {
      console.error(JSON.stringify({ level: "error", event: "player.report.failed", error: err.message }));
      return null;
    }),
  ]);
  const lineupRole = ROLES.find((r) => lineup.slots[r] === player.id) ?? null;
  const championsById: Record<string, PortraitChampion> = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const editHref = editable ? `/players/${player.id}/edit` : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5" data-testid="player-profile">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{player.displayName}</h1>
            <Badge tone={player.group === "main" ? "accent" : "neutral"}>{player.group === "main" ? "Main player" : "Other player"}</Badge>
            {lineupRole ? (
              <Badge tone="good">
                <RoleIcon role={lineupRole} className="h-3 w-3" /> in lineup as {ROLE_LABELS[lineupRole]}
              </Badge>
            ) : null}
            {selfView ? <Badge tone="accent">you</Badge> : null}
            {player.archivedAt ? <Badge tone="warn">archived</Badge> : null}
          </div>
          <p className="text-sm text-fg-muted">
            {ROLE_LABELS[player.primaryRole]}
            {player.secondaryRole ? ` · ${ROLE_LABELS[player.secondaryRole]} (secondary)` : ""}
            {player.riotId ? ` · ${player.riotId}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editHref ? (
            <Link href={editHref}>
              <Button variant="primary">{selfView ? "Edit my profile" : "Edit profile"}</Button>
            </Link>
          ) : null}
          {admin ? (
            <Link href="/admin/players">
              <Button variant="ghost">Players &amp; accounts</Button>
            </Link>
          ) : null}
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="ROLES & CHAMPION POOLS"
          subtitle={`What UNIIVERSE may draft for ${selfView ? "you" : player.displayName}: only pool champions are ever recommended, in pool order. ${editable ? (selfView ? "You" : "The player and admins") + " can change them." : "Only the player and admins can change them."}`}
          actions={
            editHref ? (
              <Link href={`${editHref}#pools`} className="text-xs text-accent hover:underline">
                Edit roles &amp; champions →
              </Link>
            ) : null
          }
        />
        <PanelBody className="grid gap-4 md:grid-cols-2">
          <PoolBlock title="Primary pool" role={player.primaryRole} pool={player.primaryPool} championsById={championsById} />
          {player.secondaryRole ? (
            <PoolBlock title="Secondary pool" role={player.secondaryRole} pool={player.secondaryPool} championsById={championsById} />
          ) : (
            <div>
              <SectionLabel className="mb-1.5">Secondary pool</SectionLabel>
              <p className="text-xs text-fg-subtle">No secondary role set.</p>
            </div>
          )}
          {player.notes ? (
            <div className="md:col-span-2">
              <SectionLabel className="mb-1">Notes</SectionLabel>
              <p className="whitespace-pre-line text-sm text-fg-muted">{player.notes}</p>
            </div>
          ) : null}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="RIOT ACCOUNTS"
          subtitle="The linked accounts behind the statistics below. Every account adds its games; a game is never counted twice."
          actions={
            editable ? (
              <Link href={selfView ? "/settings" : `${editHref}#riot-accounts`} className="text-xs text-accent hover:underline">
                Manage Riot accounts →
              </Link>
            ) : null
          }
        />
        <PanelBody className="space-y-1.5">
          {overview.accounts.length === 0 ? <p className="text-sm text-fg-muted">No Riot account linked yet.</p> : null}
          {overview.accounts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm" data-testid="riot-account">
              <span className="font-medium text-fg">{a.riotId}</span>
              <Badge tone="neutral" title={a.platformSource === "riot" ? "Server confirmed by Riot's account records" : "Server as selected; Riot confirms it during the first sync"}>
                {a.platformLabel}
                {a.platformSource === "riot" ? " ✓" : ""}
              </Badge>
              {a.rank ? (
                <Badge tone="info" title="Ranked tier on this account (Solo/Duo; Flex when unranked in Solo/Duo), as last synced">
                  {a.rank.text}
                </Badge>
              ) : null}
              <Badge tone={a.sync.tone} title={a.sync.detail}>
                {a.sync.label}
              </Badge>
              <span className="text-xs text-fg-subtle">{a.sync.lastUpdatedAt ? `updated ${timeAgo(a.sync.lastUpdatedAt)}` : "never updated"}</span>
            </div>
          ))}
        </PanelBody>
      </Panel>

      <PlayerOverview data={overview} player={player} championsById={championsById} basePath={`/players/${player.id}`} selfView={selfView} editHref={editHref ? `${editHref}#pools` : null} />

      {report ? (
        <details className="group rounded-lg border border-border bg-surface">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-fg-muted hover:text-fg sm:px-4">
            All champion data (proficiency detail)
            <span className="text-[10px] font-normal normal-case tracking-normal text-fg-subtle group-open:hidden">show</span>
            <span className="hidden text-[10px] font-normal normal-case tracking-normal text-fg-subtle group-open:inline">hide</span>
          </summary>
          <div className="border-t border-border p-2 sm:p-3">
            <ErrorBoundary label="Riot data">
              <PlayerDataPanel report={report} championsById={championsById} admin={hasPermission(session, "manage-settings")} playerName={player.displayName} selfView={selfView} showAccounts={false} />
            </ErrorBoundary>
          </div>
        </details>
      ) : null}
    </div>
  );
}
