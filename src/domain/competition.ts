/**
 * Competition modes describe the context of a game: how much we know about the opponent before
 * champion select and which draft format applies by default. Every draft and saved match keeps
 * its mode so history stays meaningful.
 */
export const COMPETITION_MODES = ["ranked-flex", "clash", "scrim", "tournament", "custom", "practice", "other"] as const;
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
  /** Organised modes can group games into a best-of series; queue modes are single games. */
  seriesAllowed: boolean;
}

export const COMPETITION_MODE_INFO: Record<CompetitionMode, CompetitionModeInfo> = {
  "ranked-flex": {
    id: "ranked-flex",
    label: "Ranked 5s / Flex",
    shortLabel: "Flex",
    description: "Our premade five in Ranked Flex: usually no opponent information before champion select (enemy Riot IDs can be added when known), simultaneous bans.",
    defaultFormatId: "ranked-flex",
    scouting: "none",
    formatSelectable: false,
    seriesAllowed: false,
  },
  clash: {
    id: "clash",
    label: "Clash",
    shortLabel: "Clash",
    description: "Riot's Clash tournament: enemy names may be known shortly before a tournament-style draft.",
    defaultFormatId: "tournament",
    scouting: "short",
    formatSelectable: false,
    seriesAllowed: false,
  },
  scrim: {
    id: "scrim",
    label: "Scrim / Organised",
    shortLabel: "Scrim",
    description: "Organised practice game against a known team; draft format configurable; single game or best-of series.",
    defaultFormatId: "tournament",
    scouting: "full",
    formatSelectable: true,
    seriesAllowed: true,
  },
  tournament: {
    id: "tournament",
    label: "Tournament",
    shortLabel: "Tourn.",
    description: "Organised competition using tournament-style draft rules; single game or best-of series.",
    defaultFormatId: "tournament",
    scouting: "full",
    formatSelectable: true,
    seriesAllowed: true,
  },
  custom: {
    id: "custom",
    label: "Custom / Practice",
    shortLabel: "Custom",
    description: "Custom or practice game with any draft format; single game or best-of series.",
    defaultFormatId: "tournament",
    scouting: "full",
    formatSelectable: true,
    seriesAllowed: true,
  },
  practice: {
    id: "practice",
    label: "Practice",
    shortLabel: "Practice",
    description: "Practice draft or in-house game; single game or best-of series.",
    defaultFormatId: "tournament",
    scouting: "full",
    formatSelectable: true,
    seriesAllowed: true,
  },
  other: {
    id: "other",
    label: "Other",
    shortLabel: "Other",
    description: "Anything else; single game or best-of series.",
    defaultFormatId: "tournament",
    scouting: "full",
    formatSelectable: true,
    seriesAllowed: true,
  },
};

/** Modes offered when starting a draft, in menu order ("practice" is kept for old records only). */
export const DRAFT_MODE_OPTIONS: CompetitionMode[] = ["ranked-flex", "clash", "scrim", "tournament", "custom", "other"];

export function seriesAllowed(mode: string | null | undefined): boolean {
  return isCompetitionMode(mode) && COMPETITION_MODE_INFO[mode].seriesAllowed;
}

export function isCompetitionMode(value: unknown): value is CompetitionMode {
  return typeof value === "string" && (COMPETITION_MODES as readonly string[]).includes(value);
}

export function competitionModeLabel(mode: string | null | undefined): string {
  return isCompetitionMode(mode) ? COMPETITION_MODE_INFO[mode].label : "Other";
}
