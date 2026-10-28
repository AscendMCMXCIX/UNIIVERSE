import { ROLE_LABELS } from "@/domain/roles";
import type { SessionGame } from "@/server/development/page-data";
import { RelativeTime } from "@/components/ui/relative-time";
import type { JournalLookups } from "@/components/ranked/types";
import { cn } from "@/lib/cn";

/**
 * A session game in two lines: "Ahri vs Syndra · Win", then the figures Riot recorded for it
 * (K/D/A, CS, length), the role and when it was played. A game typed in by hand has no figures and
 * says so rather than showing zeros.
 */
export function GameFacts({ game, lookups, className }: { game: Pick<SessionGame, "championId" | "enemyChampionId" | "result" | "role" | "playedAt" | "figures" | "riotMatchId">; lookups: Pick<JournalLookups, "championsById">; className?: string }) {
  const name = (id: string) => lookups.championsById[id]?.name ?? id;
  const f = game.figures;
  const parts: string[] = [];
  if (f?.kills !== null && f?.kills !== undefined && f.deaths !== null && f.assists !== null) parts.push(`${f.kills}/${f.deaths}/${f.assists}`);
  if (f?.cs !== null && f?.cs !== undefined) parts.push(`${f.cs} CS`);
  if (f?.durationSec) parts.push(`${Math.round(f.durationSec / 60)} min`);
  if (game.role) parts.push(ROLE_LABELS[game.role]);
  return (
    <div className={cn("min-w-0", className)}>
      <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
        <span className="font-semibold text-fg">{name(game.championId)}</span>
        {game.enemyChampionId ? <span className="text-fg-muted">vs {name(game.enemyChampionId)}</span> : null}
        <span className={cn("font-medium", game.result === "win" ? "text-blue" : "text-red")}>{game.result === "win" ? "Win" : "Loss"}</span>
      </p>
      <p className="truncate text-xs text-fg-muted">
        {parts.length ? `${parts.join(" · ")} · ` : game.riotMatchId ? "" : "Added by hand · "}
        <RelativeTime date={game.playedAt} />
      </p>
    </div>
  );
}
