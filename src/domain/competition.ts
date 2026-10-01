/**
 * Competition modes describe the context of a game: how much we know about the opponent before
 * champion select and which draft format applies by default. Every draft and saved match keeps
 * its mode so history stays meaningful.
 */
export const COMPETITION_MODES = ["ranked-flex", "clash", "scrim", "tournament", "custom", "other"] as const;
export type CompetitionMode = (typeof COMPETITION_MODES)[number];

export interface CompetitionModeInfo {
  id: CompetitionMode;
  label: string;
  shortLabel: string;
  description: string;
  defaultFormatId: string;
  /** How much opponent information is normally available before the draft. */
  scouting: "none" | "short" | "full";
  /** Whether the user can choose a different format for this mode. */
  formatSelectable: boolean;
}

export const COMPETITION_MODE_INFO: Record<CompetitionMode, CompetitionModeInfo> = {
  "ranked-flex": {
    id: "ranked-flex",
    label: "Ranked Flex",
    shortLabel: "Flex",
    description: "Ranked Flex / 5s queue: no opponent information before champion select, simultaneous bans.",
    defaultFormatId: "ranked-flex",
    scouting: "none",
    formatSelectable: false,
  },
  clash: {
    id: "clash",
    label: "Clash",
    shortLabel: "Clash",
    description: "Riot's Clash tournament: a short scouting window before a tournament-style draft.",
    defaultFormatId: "tournament",
    scouting: "short",
    formatSelectable: false,
  },
  scrim: {
    id: "scrim",
    label: "Scrim / Organised",
    shortLabel: "Scrim",
    description: "Organised practice game; opponent may be known; draft format configurable.",
    defaultFormatId: "tournament",
    scouting: "full",
    formatSelectable: true,
  },
  tournament: {
    id: "tournament",
    label: "Tournament",
    shortLabel: "Tourn.",
    description: "Organised competition using tournament-style draft rules.",
    defaultFormatId: "tournament",
    scouting: "full",
    formatSelectable: true,
  },
  custom: {
    id: "custom",
    label: "Custom / Practice",
    shortLabel: "Custom",
    description: "Custom game or practice draft with any format.",
    defaultFormatId: "tournament",
    scouting: "full",
    formatSelectable: true,
  },
  other: {
    id: "other",
    label: "Other",
    shortLabel: "Other",
    description: "Anything else.",
    defaultFormatId: "tournament",
    scouting: "full",
    formatSelectable: true,
  },
};

export function isCompetitionMode(value: unknown): value is CompetitionMode {
  return typeof value === "string" && (COMPETITION_MODES as readonly string[]).includes(value);
}

export function competitionModeLabel(mode: string | null | undefined): string {
  return isCompetitionMode(mode) ? COMPETITION_MODE_INFO[mode].label : "Other";
}
