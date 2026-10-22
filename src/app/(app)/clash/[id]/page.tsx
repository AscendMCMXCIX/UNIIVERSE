import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { earlierScoutsOf, getScout, matchesForScout } from "@/server/clash/scouts";
import { canDeleteScout, canEditScout, clashScoutEnabled } from "@/server/clash/access";
import { PageHeader } from "@/components/ui/page-header";
import { ClashWorkspace } from "@/components/clash/clash-workspace";
import type { EarlierView } from "@/components/clash/scout-card";

export const dynamic = "force-dynamic";

/** One saved scout, in the same workspace: the team's members open it from the history or a shared link. */
export default async function SavedScoutPage({ params }: { params: Promise<{ id: string }> }) {
  if (!clashScoutEnabled()) notFound();
  const { id } = await params;
  const db = await getAppDb();
  const [team, session] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-team")]);
  // Within this team only: another team's scout id reads as not found.
  const scout = await getScout(db, team.id, id);
  if (!scout) notFound();
  const puuids = scout.content.players.filter((p) => p.verification === "verified" && p.puuid).map((p) => p.puuid!);
  const [champions, earlierRows, matches] = await Promise.all([listChampions(db), earlierScoutsOf(db, team.id, puuids, scout.id), matchesForScout(db, team.id, scout)]);
  const earlier: Record<string, EarlierView[]> = {};
  for (const e of earlierRows) (earlier[e.puuid] ??= []).push({ scoutId: e.scoutId, opponentName: e.opponentName, scoutedAt: e.scoutedAt.toISOString() });
  const title = [scout.opponentName, scout.content.tournament.name, scout.content.tournament.day].filter(Boolean).join(" · ");
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-6">
      <PageHeader eyebrow="Clash Scout" title={title} />
      <ClashWorkspace
        saved={{
          id: scout.id,
          updatedAt: scout.updatedAt.toISOString(),
          scoutedAt: scout.scoutedAt.toISOString(),
          createdByName: scout.createdByName,
          canEdit: canEditScout(session, scout.createdBy),
          canDelete: canDeleteScout(session, scout.createdBy),
        }}
        initial={scout.content}
        defaultPlatform={scout.platform}
        champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }))}
        ddragonVersion={null}
        recognition="real"
        earlier={earlier}
        matches={matches.map((m) => ({ matchId: m.matchId, playedAt: new Date(m.gameCreation).toISOString(), win: m.win, opponentsFound: m.opponentsFound }))}
      />
    </div>
  );
}
