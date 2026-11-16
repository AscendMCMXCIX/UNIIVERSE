"use client";

import type { Icon } from "@/server/players/match-history";
import { cn } from "@/lib/cn";
import { useImageFailure } from "@/components/ui/remote-image";

/**
 * The letters a Riot icon's stand-in shows when its image fails: the first letters of its first two
 * capitalised words ("Plated Steelcaps" → "PS", "Hail of Blades" → "HB"), else of its first two
 * words, else the first two letters of its one word ("Flash" → "Fl"). Words that start with a
 * digit are skipped ("Item 3047" → "It").
 */
export function iconInitials(name: string): string {
  const words = name.split(/[\s-]+/).filter((w) => /^\p{L}/u.test(w));
  const capitals = words.filter((w) => /^\p{Lu}/u.test(w));
  const pick = capitals.length >= 2 ? capitals : words;
  if (pick.length >= 2) return (pick[0]![0]! + pick[1]![0]!).toUpperCase();
  return [...(pick[0] ?? name.trim())].slice(0, 2).join("");
}

/**
 * A Riot icon (item, spell, rune) at a fixed size. Three states that never look alike: the image;
 * an empty slot (no icon: a plain tile); and an image that failed to load (Data Dragon down, a
 * blocked host, an app offline), which shows the icon's initials on a tile with its name on hover
 * and for screen readers (docs/STANDARDS.md → Images: a designed stand-in).
 */
export function IconImg({ icon, size = 22, rounded = "rounded", className }: { icon: Icon | null; size?: number; rounded?: string; className?: string }) {
  const { failed, ref, onError } = useImageFailure(icon?.url);
  const box = { width: `${size / 16}rem`, height: `${size / 16}rem` };
  if (!icon) return <span className={cn("inline-block shrink-0 bg-surface-3/70", rounded, className)} style={box} aria-hidden />;
  if (failed)
    return (
      <span role="img" aria-label={icon.name} title={icon.name} className={cn("grid shrink-0 place-items-center overflow-hidden bg-surface-3 text-4xs font-semibold leading-none text-fg-muted", rounded, className)} style={box} data-testid="icon-initials">
        <span aria-hidden>{iconInitials(icon.name)}</span>
      </span>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={icon.url} alt={icon.name} title={icon.name} width={size} height={size} loading="lazy" decoding="async" className={cn("shrink-0 bg-surface-3", rounded, className)} style={box} ref={ref} onError={onError} />
  );
}

/**
 * `stacked`: the six items in two rows of three with the trinket beside the first row (about 6rem
 * wide), for cards that also show both teams. `className` and `trinketClassName` let a card
 * return it to one line where it has the room across (e.g. `grid-cols-7` with the trinket last).
 * A card's build that was not recorded draws nothing (empty slots there read as a build): only
 * screen readers hear it, and the page's data status counts those games. The one-line row (a
 * game's scoreboard) keeps its quiet empty slots, so its columns stay in line. A build is one image
 * to screen readers, named by its items ("Items: Plated Steelcaps, Trinity Force", or "none").
 */
export function ItemRow({ items, size = 22, stacked = false, className, trinketClassName }: { items: Array<Icon | null> | null; size?: number; stacked?: boolean; className?: string; trinketClassName?: string }) {
  if (stacked) {
    if (!items)
      return (
        <span className="sr-only" data-testid="items-missing">
          Items not recorded
        </span>
      );
    return (
      <span className={cn("grid grid-cols-4 gap-0.5", className)} role="img" aria-label={`Items: ${items.filter(Boolean).map((i) => i!.name).join(", ") || "none"}`}>
        {[0, 1, 2, 6, 3, 4, 5].map((i) => (
          <IconImg key={i} icon={items[i] ?? null} size={size} className={i === 6 ? cn("rounded-full", trinketClassName) : undefined} />
        ))}
      </span>
    );
  }
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
    <span className="flex items-center gap-0.5" role="img" aria-label={`Items: ${items.filter(Boolean).map((i) => i!.name).join(", ") || "none"}`}>
      {items.map((it, i) => (
        <IconImg key={i} icon={it} size={size} className={i === 6 ? "ml-0.5 rounded-full" : undefined} />
      ))}
    </span>
  );
}
