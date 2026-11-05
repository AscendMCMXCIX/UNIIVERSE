"use client";

import { cn } from "@/lib/cn";
import { useImageFailure } from "@/components/ui/remote-image";

/*
  A ranked tier's official crest (Riot's own artwork, served from the game client's files via
  Community Dragon). Small and decorative: the tier and division are always written next to it.
  If the image cannot load (even before the page is interactive), a plain tier-coloured dot takes
  its place; a broken image never shows and nothing waits for it.
*/

const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
const TIER_COLOUR: Record<string, string> = {
  IRON: "#7c6f6a",
  BRONZE: "#a8714c",
  SILVER: "#9aa6b2",
  GOLD: "#d2a64b",
  PLATINUM: "#4fb3a9",
  EMERALD: "#2fae6b",
  DIAMOND: "#6f8cf0",
  MASTER: "#b45ad6",
  GRANDMASTER: "#d8473f",
  CHALLENGER: "#e8c060",
};

export function isRankedTier(tier: string | null | undefined): tier is (typeof TIERS)[number] {
  return !!tier && (TIERS as readonly string[]).includes(tier.toUpperCase());
}

export function rankEmblemUrl(tier: string): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier.toLowerCase()}.svg`;
}

export function RankEmblem({ tier, className }: { tier: string | null | undefined; className?: string }) {
  const key = tier?.toUpperCase() ?? "";
  const { failed, ref, onError } = useImageFailure(isRankedTier(key) ? rankEmblemUrl(key) : null);
  if (!isRankedTier(key)) return <span aria-hidden className={cn("inline-block rounded-full border border-border-strong bg-surface-2", className)} data-testid="rank-emblem" data-tier="UNRANKED" />;
  if (failed) return <span aria-hidden className={cn("inline-block rounded-full", className)} style={{ background: TIER_COLOUR[key] }} data-testid="rank-emblem" data-tier={key} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={rankEmblemUrl(key)} alt="" aria-hidden loading="lazy" decoding="async" ref={ref} onError={onError} className={cn("inline-block object-contain", className)} data-testid="rank-emblem" data-tier={key} />
  );
}

/** "Emerald II", "Master" (apex tiers have no division), "Unranked". */
export function rankLabel(tier: string | null | undefined, division: string | null | undefined): string {
  if (!isRankedTier(tier)) return "Unranked";
  const name = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  const apex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier.toUpperCase());
  return apex || !division ? name : `${name} ${division}`;
}

/** A rank as cards carry it (the last known one read from Riot). */
export interface CompactRank {
  tier: string;
  division: string | null;
  leaguePoints: number;
  queue: "solo" | "flex" | null;
}

/**
 * Crest + "Emerald II", one line; "Unranked" with a neutral mark when there is none. Null means no
 * ranked placement on record, never "not shown to you": a rank the viewer may not see (a
 * teammate's, without "view teammates' statistics") is left out by the caller instead
 * (CardIdentity's showRank, the profile header's identity.showRank), so it is never read as Unranked.
 */
export function RankInline({ rank, className, showQueue = false }: { rank: CompactRank | null; className?: string; showQueue?: boolean }) {
  const label = rank ? rankLabel(rank.tier, rank.division) : "Unranked";
  const queue = rank?.queue === "flex" ? "Flex" : rank?.queue === "solo" ? "Solo/Duo" : null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)} title={rank ? `${queue ? `Ranked ${queue}` : "Ranked"} · ${label} · ${rank.leaguePoints} LP (last known)` : "No ranked placement on record"} data-testid="rank-inline">
      <RankEmblem tier={rank?.tier} className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
      {showQueue && queue ? <span className="shrink-0 text-fg-subtle">· {queue}</span> : null}
    </span>
  );
}
