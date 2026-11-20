"use client";

import * as React from "react";
import { BookOpen, ChartColumn, Globe, GraduationCap, Newspaper, PlaySquare, Swords, Trophy, Wrench, type LucideIcon } from "lucide-react";
import { resourceHost, resourceIconAsset, type ResourceIcon as IconKey } from "@/domain/resource-entry";
import { hueOf } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";

export const RESOURCE_ICON_COMPONENTS: Record<Exclude<IconKey, "favicon">, LucideIcon> = {
  globe: Globe,
  news: Newspaper,
  stats: ChartColumn,
  book: BookOpen,
  trophy: Trophy,
  learn: GraduationCap,
  swords: Swords,
  tool: Wrench,
  video: PlaySquare,
};

const TILE = "grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-surface-2 text-fg-muted";

/**
 * The stand-in for a site whose own icon cannot be loaded (many hosts serve no /favicon.ico, Riot's
 * among them): the host's initial on a tile tinted from the host, as a member without a picture
 * gets their initial (ui/avatar.tsx), so every site keeps a face of its own and no two rows share
 * one generic mark.
 */
function HostTile({ host, className }: { host: string; className?: string }) {
  const hue = hueOf(host);
  return (
    <span aria-hidden className={cn(TILE, "text-xs font-semibold", className)} style={{ background: `hsl(${hue} 45% 22%)`, color: `hsl(${hue} 80% 82%)` }} data-testid="resource-icon-standin">
      {(host[0] ?? "?").toUpperCase()}
    </span>
  );
}

/**
 * A resource's icon: the site's own icon, shipped with the app (public/resource-icons, for the
 * library's own sites: resourceIconAsset), or the host's initial for any other site; or the icon an
 * administrator chose. Nothing is loaded from the site itself (UD.R1: every visit logged a
 * cross-origin error, and most hosts serve no icon there), so it costs no request beyond the
 * app's own, cached, and never shows a broken image.
 */
export function ResourceIcon({ icon, url, className }: { icon: IconKey; url: string; className?: string }) {
  if (icon === "favicon") {
    const asset = resourceIconAsset(url);
    // eslint-disable-next-line @next/next/no-img-element -- a 40px file of the app's own, drawn at 20px: no optimisation to gain.
    if (asset) return <img src={asset} alt="" aria-hidden width={20} height={20} loading="lazy" decoding="async" className={cn(TILE, "p-1.5 object-contain", className)} data-testid="resource-icon-asset" />;
    return <HostTile host={resourceHost(url)} className={className} />;
  }
  const Icon = RESOURCE_ICON_COMPONENTS[icon];
  return (
    <span className={cn(TILE, className)} aria-hidden>
      <Icon className="h-4 w-4" />
    </span>
  );
}
