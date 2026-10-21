import * as React from "react";
import { cn } from "@/lib/cn";
import { RemoteImage } from "@/components/ui/remote-image";

export interface PortraitChampion {
  id: string;
  name: string;
  portraitUrl: string;
}

const sizes = {
  xs: "h-7 w-7",
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "h-20 w-20",
};

/** Pixel sizes matching the classes above, so the browser reserves the box before the image loads. */
const pixels: Record<keyof typeof sizes, number> = { xs: 28, sm: 36, md: 48, lg: 64, xl: 80 };

/**
 * Champion portrait from Data Dragon. Falls back to a lettered tile when no portrait URL is
 * known (offline fixture mode) or the portrait cannot load, so layouts never break and a broken
 * image never shows. Lazy, async-decoded and sized up front.
 */
export function ChampionPortrait({ champion, size = "md", className, dimmed = false, title }: { champion: PortraitChampion | null | undefined; size?: keyof typeof sizes; className?: string; dimmed?: boolean; title?: string }) {
  const base = cn("relative shrink-0 overflow-hidden rounded-md border border-border bg-surface-2", sizes[size], dimmed && "opacity-40 grayscale", className);
  if (!champion) {
    return <div className={cn(base, "border-dashed")} title={title} />;
  }
  const letters = (
    <div className={cn(base, "grid place-content-center text-xs font-semibold text-fg-muted")} title={title ?? champion.name}>
      {champion.name.slice(0, 2).toUpperCase()}
    </div>
  );
  if (!champion.portraitUrl) return letters;
  return <RemoteImage src={champion.portraitUrl} fallback={letters} alt={champion.name} title={title ?? champion.name} width={pixels[size]} height={pixels[size]} loading="lazy" decoding="async" className={cn(base, "object-cover")} />;
}
