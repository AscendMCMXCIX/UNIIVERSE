"use client";

import * as React from "react";
import { BookOpen, ChartColumn, Globe, GraduationCap, Newspaper, PlaySquare, Swords, Trophy, Wrench, type LucideIcon } from "lucide-react";
import { faviconUrl, type ResourceIcon as IconKey } from "@/domain/resources";
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

const noopSubscribe = () => () => {};

/**
 * A resource's icon: the site's own favicon, loaded by the browser from the site (no referrer is
 * sent, lazily, 20 px), or the icon an administrator chose. A favicon that does not load becomes
 * the globe, so a broken image never shows.
 */
export function ResourceIcon({ icon, url, className }: { icon: IconKey; url: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  // Drawn once the page is interactive (the globe until then): a favicon that failed while the
  // server's HTML loaded, before React was listening, would otherwise stay a broken image.
  const mounted = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const src = icon === "favicon" && mounted && !failed ? faviconUrl(url) : null;
  const box = cn("grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-fg-muted", className);
  if (src) {
    return (
      <span className={box} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- another site's icon, at its own address */}
        <img src={src} alt="" width={20} height={20} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-5 w-5 object-contain" onError={() => setFailed(true)} />
      </span>
    );
  }
  const Icon = icon === "favicon" ? Globe : RESOURCE_ICON_COMPONENTS[icon];
  return (
    <span className={box} aria-hidden>
      <Icon className="h-4 w-4" />
    </span>
  );
}
