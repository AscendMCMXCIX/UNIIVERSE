/**
 * Metric glossary: every number UNIIVERSE shows is described here once (what it is, its unit,
 * the population it is computed over, and where it comes from). UI labels and ⓘ tooltips read
 * from this table, so a term means the same thing on every page.
 */
export type MetricUnit = "win-rate points" | "percent of games" | "games" | "0–1 scale" | "points" | "level" | "days" | "count" | "label";

export interface MetricDefinition {
  /** Short title shown next to the value. */
  title: string;
  unit: MetricUnit;
  /** What the number is computed over. */
  population: string;
  /** One or two plain sentences. */
  description: string;
  /** Where the underlying data comes from. */
  source: string;
}

export const METRICS = {
  "proficiency-tier": {
    title: "Experience",
    unit: "label",
    population: "Every stored game on the player's linked accounts (all seasons, supported queues), games in the role, recency and mastery; not limited by the page's filters",
    description: "Played a lot · Played regularly · Some experience · Few games · Not played lately · No games. How much the player has played the champion in that role, worked out from their games (experience, not skill, and not their choice: the pool they pick is shown as \"In pool\"); their results are shown alongside.",
    source: "Linked Riot accounts",
  },
  "recent-games": {
    title: "Recent games",
    unit: "games",
    population: "Ranked, normal and Clash games on the champion in the last 30 days, all linked accounts",
    description: "Each game counts once, however many accounts are linked.",
    source: "Linked Riot accounts (match history)",
  },
  "patch-games": {
    title: "Games this patch",
    unit: "games",
    population: "Games on the champion on the current patch, all linked accounts",
    description: "Recent practice on the current balance state.",
    source: "Linked Riot accounts (match history)",
  },
  "games-on-record": {
    title: "Games on record",
    unit: "games",
    population: "Games on the champion in the sync window (about four months), all linked accounts",
    description: "Deduplicated by Riot's PUUID: a game is never counted twice.",
    source: "Linked Riot accounts (match history)",
  },
  "mastery-points": {
    title: "Mastery",
    unit: "points",
    population: "Champion mastery on the player's strongest linked account",
    description: "Riot's long-term play volume indicator for the champion; not combined across accounts.",
    source: "Linked Riot accounts (champion mastery)",
  },
  "role-usage": {
    title: "Role usage",
    unit: "percent of games",
    population: "Share of the player's games on the champion that were in the assigned role",
    description: "100% means every game on this champion was in this role.",
    source: "Linked Riot accounts (match history)",
  },
  "proficiency-confidence": {
    title: "Confidence",
    unit: "label",
    population: "Sample size behind the proficiency estimate (games, mastery, recency)",
    description: "High · medium · low. Low-confidence estimates barely move recommendations.",
    source: "Proficiency model",
  },
  "last-played": {
    title: "Last played",
    unit: "days",
    population: "Most recent game on the champion across linked accounts",
    description: "Recency matters: familiarity fades after a few months without games.",
    source: "Linked Riot accounts",
  },
  rank: {
    title: "Rank",
    unit: "label",
    population: "Ranked tier on the player's main linked account (Solo/Duo; Flex only when unranked in Solo/Duo)",
    description: "Tier, division and LP with that queue's season wins and losses, as of the last sync.",
    source: "Linked Riot accounts (league entries)",
  },
  "season-record": {
    title: "Season record",
    unit: "games",
    population: "Games in the selected season and game mode, every champion, all linked accounts",
    description: "Wins and losses counted from the stored games themselves; a game played on two linked accounts counts once. Shown only when games exist.",
    source: "Linked Riot accounts (match history)",
  },
  "season-modes": {
    title: "Games by mode",
    unit: "games",
    population: "Games in the selected season, all linked accounts, split by queue",
    description: "Ranked Solo/Duo, Ranked Flex and Normal games (Draft, Quickplay, Swiftplay). Clash games count in All supported games only.",
    source: "Linked Riot accounts (match history)",
  },
  "season-coverage": {
    title: "Season data",
    unit: "label",
    population: "Whether every game of the season has been collected from Riot yet",
    description: "Complete once the whole season's match list has been read for every linked account. Until then the figures are partial and grow with each sync.",
    source: "Account sync",
  },
  "combined-mastery": {
    title: "Mastery",
    unit: "points",
    population: "Champion mastery points from Riot, added up over the player's linked accounts (each account once)",
    description: "Long-term familiarity. Mastery is not current form: a champion with huge mastery and no recent games is shown as rusty.",
    source: "Linked Riot accounts (champion mastery)",
  },
  "last-sync": {
    title: "Last sync",
    unit: "label",
    population: "Most recent refresh of any of the player's linked accounts",
    description: "Accounts refresh automatically every few hours; a manual sync is available where Riot accounts are managed.",
    source: "Account sync",
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricKey = keyof typeof METRICS;

export function metric(key: MetricKey): MetricDefinition {
  return METRICS[key];
}

/** Tooltip text for a metric: title, unit, population and source in one string. */
export function metricTooltip(key: MetricKey): string {
  const m = METRICS[key];
  return `${m.title} (${m.unit}). ${m.description} Population: ${m.population}. Source: ${m.source}.`;
}
