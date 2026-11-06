"use client";

import * as React from "react";
import { BookOpen, ChartColumn, Globe, GraduationCap, Newspaper, PlaySquare, Swords, Trophy, Wrench, type LucideIcon } from "lucide-react";
import { faviconUrl, resourceHost, type ResourceIcon as IconKey } from "@/domain/resource-entry";
import { RemoteImage } from "@/components/ui/remote-image";
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
 * A resource's icon: the site's own favicon, loaded by the browser from the site (no referrer is
 * sent, lazily, 20 px), or the icon an administrator chose. The favicon is in the server's HTML,
 * so its request starts with the page; one that fails, before or after the page is interactive
 * (RemoteImage), becomes the host's initial, never a broken image.
 */
export function ResourceIcon({ icon, url, className }: { icon: IconKey; url: string; className?: string }) {
  const src = icon === "favicon" ? faviconUrl(url) : null;
  if (src) {
    return (
      <RemoteImage
        src={src}
        fallback={<HostTile host={resourceHost(url)} className={className} />}
        alt=""
        aria-hidden
        width={20}
        height={20}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        // The image is its own tile: the 20 px icon sits in the tile's padding.
        className={cn(TILE, "p-1.5 object-contain", className)}
      />
    );
  }
  const Icon = icon === "favicon" ? Globe : RESOURCE_ICON_COMPONENTS[icon];
  return (
    <span className={cn(TILE, className)} aria-hidden>
      <Icon className="h-4 w-4" />
    </span>
  );
}
