import * as React from "react";
import { cn } from "@/lib/cn";

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

/**
 * Champion portrait from Data Dragon. Falls back to a lettered tile when no portrait URL is
 * known (offline fixture mode) so layouts never break.
 */
export function ChampionPortrait({ champion, size = "md", className, dimmed = false, title }: { champion: PortraitChampion | null | undefined; size?: keyof typeof sizes; className?: string; dimmed?: boolean; title?: string }) {
  const base = cn("relative shrink-0 overflow-hidden rounded-md border border-border bg-surface-2", sizes[size], dimmed && "opacity-40 grayscale", className);
  if (!champion) {
    return <div className={cn(base, "border-dashed")} title={title} />;
  }
  if (!champion.portraitUrl) {
    return (
      <div className={cn(base, "grid place-content-center text-xs font-semibold text-fg-muted")} title={title ?? champion.name}>
        {champion.name.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={champion.portraitUrl} alt={champion.name} title={title ?? champion.name} loading="lazy" decoding="async" className={cn(base, "object-cover")} />
  );
}
