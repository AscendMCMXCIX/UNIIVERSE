/*
  Ranked Development: the gameplay areas a player can practise. One list serves the weakness
  library (what an objective is about) and the post-game review (what went best, what was
  hardest), so a review and an objective speak the same language. The areas are grouped by the
  part of the game they belong to, so a picker can show a few groups instead of one long list.
  A player may also name an area of their own on an objective ("custom").
*/

export const CATEGORY_GROUPS = [
  { key: "early", label: "Early game" },
  { key: "map", label: "Map and macro" },
  { key: "fights", label: "Fights" },
  { key: "habits", label: "Habits" },
] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number]["key"];

export const DEVELOPMENT_CATEGORIES = [
  { key: "laning", label: "Laning fundamentals", group: "early" },
  { key: "wave-management", label: "Wave management", group: "early" },
  { key: "trading", label: "Trading", group: "early" },
  { key: "jungle-awareness", label: "Jungle awareness", group: "early" },
  { key: "recall-timing", label: "Recall timing", group: "early" },
  { key: "vision", label: "Vision", group: "map" },
  { key: "map-awareness", label: "Map awareness", group: "map" },
  { key: "objective-setup", label: "Objective preparation", group: "map" },
  { key: "rotations", label: "Mid-game rotations", group: "map" },
  { key: "side-lane", label: "Side-lane management", group: "map" },
  { key: "teamfighting", label: "Teamfighting", group: "fights" },
  { key: "positioning", label: "Positioning", group: "fights" },
  { key: "resources", label: "Resource management", group: "habits" },
  { key: "decision-making", label: "Decision-making discipline", group: "habits" },
  { key: "mechanics", label: "Mechanics", group: "habits" },
  { key: "mental", label: "Mental and focus", group: "habits" },
  { key: "other", label: "Other", group: "habits" },
] as const satisfies ReadonlyArray<{ key: string; label: string; group: CategoryGroup }>;

export type CategoryKey = (typeof DEVELOPMENT_CATEGORIES)[number]["key"];
/** An objective's area: one of the list, or one the player named ("custom", with its name kept beside it). */
export type ObjectiveCategory = CategoryKey | "custom";

export function isCategory(value: unknown): value is CategoryKey {
  return typeof value === "string" && DEVELOPMENT_CATEGORIES.some((c) => c.key === value);
}

export function isObjectiveCategory(value: unknown): value is ObjectiveCategory {
  return value === "custom" || isCategory(value);
}

/** "Wave management"; a custom area reads as the name the player gave it. */
export function categoryLabel(key: string | null | undefined, custom?: string | null): string {
  if (key === "custom") return custom?.trim() || "Custom";
  return DEVELOPMENT_CATEGORIES.find((c) => c.key === key)?.label ?? "—";
}

export function categoriesIn(group: CategoryGroup): ReadonlyArray<(typeof DEVELOPMENT_CATEGORIES)[number]> {
  return DEVELOPMENT_CATEGORIES.filter((c) => c.group === group);
}

/** A custom area's name as kept: trimmed, single-spaced, 2 to 40 characters; null when it is not usable. */
export function cleanCustomCategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  return v.length >= 2 && v.length <= 40 ? v : null;
}

/**
 * The Solo Queue Blocks journal recorded one "main mistake" per game from its own nine keys; they
 * map onto these areas so old games read in the same terms (migration 0059 copies them once).
 */
export const LEGACY_MISTAKE_CATEGORY: Record<string, CategoryKey> = {
  mechanics: "mechanics",
  "trading-laning": "trading",
  "wave-tempo": "wave-management",
  "vision-awareness": "vision",
  "macro-objectives": "objective-setup",
  "positioning-teamfight": "teamfighting",
  "decision-making": "decision-making",
  mental: "mental",
  other: "other",
};
