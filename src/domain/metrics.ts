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
  "decision-gap": {
    title: "Decision gap",
    unit: "win-rate points",
    population: "Recommended option versus the runner-up, projected full team",
    description: "How far ahead the recommended option is. 1 point ≈ 1% expected win rate for the completed team. Under 1.2 points is a close call.",
    source: "Draft engine (statistics + curated champion model + player data)",
  },
  "score-gap": {
    title: "Gap to top option",
    unit: "win-rate points",
    population: "This option versus the top-ranked option, projected full team",
    description: "Negative means this option projects a weaker completed team than the recommendation, by this many points.",
    source: "Draft engine",
  },
  "execution-demand": {
    title: "Execution demand",
    unit: "0–1 scale",
    population: "Curated champion characteristics (mechanics, coordination, punish windows)",
    description: "0 = forgiving, 1 = very demanding. Above 0.6 needs practice and communication to pay off.",
    source: "Curated champion model",
  },
  "team-fit": {
    title: "Team fit",
    unit: "win-rate points",
    population: "Pair synergy evidence plus composition structure of the projected team",
    description: "How well the champion combines with our locked and projected picks: proven pairs and the shape of the composition (engage, frontline, damage mix…).",
    source: "Ranked and pro game statistics + curated composition model",
  },
  "enemy-interaction": {
    title: "Into their draft",
    unit: "win-rate points",
    population: "Lane matchup, cross-role matchups and composition interaction against revealed enemy picks",
    description: "Positive means the pick plays well into what the enemy has shown. Blind when nothing is revealed.",
    source: "Ranked and pro matchup statistics + curated composition model",
  },
  "player-proficiency": {
    title: "Player proficiency",
    unit: "win-rate points",
    population: "This player's configured pool order plus games, recency, role usage and results on linked Riot accounts",
    description: "The player's comfort on the champion. Pools decide what is legal; proficiency only shifts preference among legal options.",
    source: "Linked Riot accounts (match history, mastery)",
  },
  "patch-strength": {
    title: "Current-patch strength",
    unit: "win-rate points",
    population: "Champion win rate in this role, blended across recent patches with shrinkage",
    description: "How strong the champion is right now in the role, relative to 50%.",
    source: "Ranked statistics (Emerald+ ladders weighted by rank band, configured regions)",
  },
  "pro-priority": {
    title: "Pro priority",
    unit: "win-rate points",
    population: "Pick and ban presence in recent professional games",
    description: "A small nudge towards champions professionals currently prioritise.",
    source: "Professional games (Leaguepedia)",
  },
  "realism": {
    title: "Execution & resources",
    unit: "win-rate points",
    population: "Projected team's execution demand, coordination burden and resource hunger",
    description: "A penalty (never a bonus) for compositions that are hard to actually play; scaled by the team's risk preference.",
    source: "Curated champion model",
  },
  "timing": {
    title: "Pick timing",
    unit: "win-rate points",
    population: "Chance the champion is gone before our next pick, and the value of holding the role for a counterpick",
    description: "Positive means lock it now; negative means it can wait.",
    source: "Draft engine (pick/ban rates, draft sequence)",
  },
  "evidence-confidence": {
    title: "Evidence confidence",
    unit: "label",
    population: "Sample sizes behind the strength and matchup estimates used for the projected team",
    description: "How much data backs this evaluation. Low means fit and pools carry the decision more than numbers.",
    source: "Ranked statistics",
  },
  "pick-rate": {
    title: "Pick rate",
    unit: "percent of games",
    population: "Share of ranked games in the period in which the champion was picked",
    description: "Picks ÷ games in the statistical period.",
    source: "Ranked statistics (Emerald+ ladders weighted by rank band, configured regions)",
  },
  "ban-rate": {
    title: "Ban rate",
    unit: "percent of games",
    population: "Share of ranked games in the period in which the champion was banned",
    description: "Bans ÷ games in the statistical period.",
    source: "Ranked statistics (Emerald+ ladders weighted by rank band, configured regions)",
  },
  "win-rate": {
    title: "Win rate",
    unit: "percent of games",
    population: "Champion's ranked games in the period, shrunk towards 50% when the sample is small",
    description: "Wins ÷ games, with Bayesian shrinkage so a few games never look decisive.",
    source: "Ranked statistics (Emerald+ ladders weighted by rank band, configured regions)",
  },
  "presence-delta": {
    title: "Presence change",
    unit: "win-rate points",
    population: "Pick + ban presence this patch versus the previous patch",
    description: "Percentage-point change in how often the champion appears in a game (picked or banned).",
    source: "Ranked statistics",
  },
  "pro-presence": {
    title: "Pro presence",
    unit: "percent of games",
    population: "Share of professional games in the period in which the champion was picked or banned",
    description: "(Picks + bans) ÷ professional games.",
    source: "Professional games (Leaguepedia)",
  },
  "proficiency-tier": {
    title: "Proficiency",
    unit: "label",
    population: "Games, recency, role usage and results across the player's linked accounts, plus mastery",
    description: "Very strong · Strong · Comfortable · Limited data · Rusty · No data. A summary of how much the player can be trusted on the champion.",
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
  "region-games": {
    title: "Games",
    unit: "games",
    population: "Ranked solo/duo matches stored from this server",
    description: "Raw matches collected from this region (all patches). Current-patch games are what the engine mainly uses.",
    source: "Riot match data",
  },
  "players-tracked": {
    title: "Players tracked",
    unit: "count",
    population: "High-Elo players on this server whose match lists are scanned",
    description: "From the Challenger, Grandmaster and Master ladders.",
    source: "Riot league data",
  },
  "queue-pending": {
    title: "Queued",
    unit: "count",
    population: "Discovered match ids from this server not yet fetched",
    description: "Drains over the next ingestion runs, within Riot's rate limits.",
    source: "UNIIVERSE ingestion queue",
  },
  "journal-games": {
    title: "Ranked games logged",
    unit: "games",
    population: "Every Solo/Duo game in your Ranked Improvement journal, finished and unfinished blocks alike",
    description: "How many games you have written down. A block of fewer than six games counts only the games it has.",
    source: "Your private journal (only you can see it)",
  },
  "journal-win-rate": {
    title: "Overall win rate",
    unit: "percent of games",
    population: "All games in your journal",
    description: "Wins divided by games logged. Nothing is weighted, shrunk or adjusted.",
    source: "Your private journal",
  },
  "journal-mistake": {
    title: "Most common mistake",
    unit: "label",
    population: "The one main mistake you chose on each logged game",
    description: "The category you pick most often. One main mistake per game keeps the signal honest.",
    source: "Your private journal",
  },
  "journal-focus": {
    title: "Current improvement focus",
    unit: "label",
    population: "Your own one-sentence note",
    description: "The one thing you are working on right now. Edit it whenever it changes.",
    source: "Your own words",
  },
  "journal-champion-win-rate": {
    title: "Win rate",
    unit: "percent of games",
    population: "Your journal games on this champion or matchup",
    description: "Raw wins over games in your journal. Small samples swing a lot; the games column tells you how much to trust it.",
    source: "Your private journal",
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
