import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { clashScoutEnabled } from "@/server/clash/access";
import { getCurrentPatch, listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listScouts, teamPlatform } from "@/server/clash/scouts";
import { scoutRecognition } from "@/server/clash/recognition-mode";
import { OPGG_PLATFORMS } from "@/domain/opgg";
import { PageHeader } from "@/components/ui/page-header";
import { ClashWorkspace } from "@/components/clash/clash-workspace";
import { ScoutHistory } from "@/components/clash/scout-history";

export const dynamic = "force-dynamic";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/**
 * CLASH SCOUT (its own sidebar entry, right below Team): a new scout (read from Clash's scouting
 * screenshots in the browser, kept there until saved) and the team's saved scouts. Team members
 * only; nothing here is public.
 */
export default async function ClashPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!clashScoutEnabled()) notFound();
  const sp = await searchParams;
  const db = await getAppDb();
  const [team] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-team")]);
  const query = str(sp.q).slice(0, 60);
  const [rows, champions, patch, platform] = await Promise.all([listScouts(db, team.id, { query, limit: 50 }), listChampions(db), getCurrentPatch(db), teamPlatform(db, team.id)]);
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-8">
      <PageHeader title="Clash Scout" description="Paste the opponents' Clash scouting screenshots to see their five players side by side, look them up, and keep the scout for the team." />
      <ClashWorkspace
        teamId={team.id}
        saved={null}
        initial={null}
        defaultPlatform={platform && OPGG_PLATFORMS.includes(platform) ? platform : "euw1"}
        champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }))}
        ddragonVersion={patch && !patch.isFixture ? patch.ddragonVersion : null}
        recognition={scoutRecognition()}
        earlier={{}}
        matches={[]}
      />
      <ScoutHistory
        query={query}
        rows={rows.map((r) => ({ id: r.id, opponentName: r.opponentName, platform: r.platform, tournamentName: r.tournamentName, playersCaptured: r.playersCaptured, playersVerified: r.playersVerified, scoutedAt: r.scoutedAt.toISOString(), createdByName: r.createdByName }))}
      />
    </div>
  );
}
