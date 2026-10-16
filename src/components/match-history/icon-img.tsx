"use client";

import * as React from "react";
import type { Icon } from "@/server/players/match-history";
import { cn } from "@/lib/cn";

/** A Riot icon (item, spell, rune) at a fixed size; an empty slot when it is missing or fails to load. */
export function IconImg({ icon, size = 22, rounded = "rounded", className }: { icon: Icon | null; size?: number; rounded?: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!icon || failed) return <span className={cn("inline-block shrink-0 bg-surface-3/70", rounded, className)} style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }} aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={icon.url} alt={icon.name} title={icon.name} width={size} height={size} loading="lazy" decoding="async" className={cn("shrink-0 bg-surface-3", rounded, className)} style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }} onError={() => setFailed(true)} />
  );
}

export function ItemRow({ items, size = 22 }: { items: Array<Icon | null> | null; size?: number }) {
  // Not collected yet: quiet empty slots (the list footer explains once), never the same sentence on every row.
  if (!items)
    return (
      <span className="flex items-center gap-0.5" role="img" aria-label="Items not recorded" data-testid="items-missing">
        {Array.from({ length: 7 }, (_, i) => (
          <IconImg key={i} icon={null} size={size} className={cn("opacity-40", i === 6 ? "ml-0.5 rounded-full" : undefined)} />
        ))}
      </span>
    );
  return (
    <span className="flex items-center gap-0.5" aria-label={`Items: ${items.filter(Boolean).map((i) => i!.name).join(", ") || "none"}`}>
      {items.map((it, i) => (
        <IconImg key={i} icon={it} size={size} className={i === 6 ? "ml-0.5 rounded-full" : undefined} />
      ))}
    </span>
  );
}
