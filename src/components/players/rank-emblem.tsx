"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/*
  A ranked tier's official crest (Riot's own artwork, served from the game client's files via
  Community Dragon). Small and decorative: the tier and division are always written next to it.
  If the image cannot load, a plain tier-coloured dot takes its place; a broken image never
  shows and nothing waits for it.
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
  const [failed, setFailed] = React.useState(false);
  const key = tier?.toUpperCase() ?? "";
  if (!isRankedTier(key)) return <span aria-hidden className={cn("inline-block rounded-full border border-border-strong bg-surface-2", className)} data-testid="rank-emblem" data-tier="UNRANKED" />;
  if (failed) return <span aria-hidden className={cn("inline-block rounded-full", className)} style={{ background: TIER_COLOUR[key] }} data-testid="rank-emblem" data-tier={key} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={rankEmblemUrl(key)} alt="" aria-hidden loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn("inline-block object-contain", className)} data-testid="rank-emblem" data-tier={key} />
  );
}

/** "Emerald II", "Master" (apex tiers have no division), "Unranked". */
export function rankLabel(tier: string | null | undefined, division: string | null | undefined): string {
  if (!isRankedTier(tier)) return "Unranked";
  const name = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase();
  const apex = ["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier.toUpperCase());
  return apex || !division ? name : `${name} ${division}`;
}
