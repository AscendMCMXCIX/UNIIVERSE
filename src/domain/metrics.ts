/**
 * Metric glossary: the figures of the champion data panel, each described once (its title, its
 * unit and one plain sentence for its ⓘ). Labels and ⓘ read from this table, so a term means the
 * same thing wherever it is shown. Only the figures a page shows are here (tooltip inventory G03).
 */
export type MetricUnit = "win-rate points" | "percent of games" | "games" | "0–1 scale" | "points" | "level" | "days" | "count" | "label";

export interface MetricDefinition {
  /** Its ⓘ: one plain sentence for an ordinary League player, at most about 25 words (tip-length.test.ts). */
  tip: string;
  /** Short title shown next to the value. */
  title: string;
  unit: MetricUnit;
}

export const METRICS = {
  "proficiency-tier": {
    tip: "How much they have played this champion in this role, from their games and mastery (not how well).",
    title: "Experience",
    unit: "label",
  },
  "recent-games": {
    tip: "Games on this champion from each patch, queue and role they played it in during the last 30 days, so some can be older.",
    title: "Recent games",
    unit: "games",
  },
  "patch-games": {
    tip: "Games on this champion on the current patch.",
    title: "Games this patch",
    unit: "games",
  },
  "games-on-record": {
    tip: "Every stored game from all their Riot accounts, each counted once.",
    title: "Games on record",
    unit: "games",
  },
  "mastery-points": {
    tip: "Riot's mastery points on this champion across their accounts: long-term play, not current form.",
    title: "Mastery",
    unit: "points",
  },
  "role-usage": {
    tip: "How many of their games on this champion were in this role, of those whose role is known.",
    title: "Role usage",
    unit: "percent of games",
  },
  "proficiency-confidence": {
    tip: "How much data the experience label rests on.",
    title: "Confidence",
    unit: "label",
  },
  "last-played": {
    tip: "Their most recent game on this champion.",
    title: "Last played",
    unit: "days",
  },





  "last-sync": {
    tip: "When Riot was last checked for this player (automatic every few hours).",
    title: "Last sync",
    unit: "label",
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricKey = keyof typeof METRICS;

export function metric(key: MetricKey): MetricDefinition {
  return METRICS[key];
}

/** A metric's ⓘ: its one plain sentence. */
export function metricTooltip(key: MetricKey): string {
  return METRICS[key].tip;
}
