import { isAdmin, type Session } from "@/server/auth/permissions";
import { formatCount, formatDate, percent } from "@/lib/format";
import { seasonLabel } from "@/domain/season";
import { FALSE_DISCOVERY_RATE, MIN_FINDING_DIFFERENCE, MIN_GAMES_EACH_SIDE, RECENT_DAYS, pairedFindings, type InsightComparison, type TeamInsights } from "@/domain/team-insights";
import type { TeamInsightsView } from "./team-insights";

/*
  The words of Team insights (app/(app)/matches/insights/page.tsx): every figure as the page shows
  it, built once on the server so the page only lays it out. Plain statements about the games
  played, never about why: "has won more often", not "plays better".

  While the owner decides whether members see it, the page is an administrators' preview: everyone
  else is sent to Team → Matches (TEAM_INSIGHTS_AUDIENCE below; activation is that one value).
*/

/** Who can open Team insights: "admins" while it is a preview, "members" once activated. */
export const TEAM_INSIGHTS_AUDIENCE: "admins" | "members" = "admins";

/** Whether this session may open the page (on top of the page's teammate-statistics right). */
export function canOpenTeamInsights(session: Pick<Session, "role" | "admin"> | null): boolean {
  return TEAM_INSIGHTS_AUDIENCE === "members" ? session !== null : isAdmin(session);
}

export interface InsightFinding {
  key: string;
  /** One sentence: what was found. */
  headline: string;
  /** The records behind it, and the adjusted difference with its interval. */
  detail: string;
  /** For a pair whose both members' comparisons are findings: the other member's view. */
  mirror: string | null;
  /** The games' dates. */
  span: string;
  direction: "more" | "less";
}

export interface InsightRow {
  key: string;
  /** "Ace with teammates, against alone". */
  label: string;
  /** "With teammates: 61% of 120 games · Alone: 49% of 200 games". */
  records: string;
  /** "+12 points (+4 to +20)", or why it was not tested. */
  result: string;
  status: "finding" | "chance" | "untested";
}

export interface TeamInsightsPageView {
  title: string;
  /** The line under the title: what was read. */
  scope: string;
  findings: InsightFinding[];
  /** Shown when nothing stands out: why, in one or two sentences. */
  nothing: string | null;
  /** How the comparisons work and what they do not say. */
  method: string[];
  /** Every comparison formed, findings first. */
  rows: InsightRow[];
  /** Games left out, in one line (null when none). */
  excluded: string | null;
}

const pts = (v: number) => `${v >= 0 ? "+" : "−"}${formatCount(Math.abs(v) * 100)}`;
const points = (v: number) => `${pts(v)} point${Math.round(Math.abs(v) * 100) === 1 ? "" : "s"}`;
const rate = (wins: number, games: number) => (games ? percent(wins / games, 0) : "—");
const games = (n: number) => `${formatCount(n)} game${n === 1 ? "" : "s"}`;
const span = (from: number | null, to: number | null) => (from === null || to === null ? "" : from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`);
const interval = (c: InsightComparison) => (c.result.low !== null && c.result.high !== null ? `likely between ${pts(c.result.low)} and ${pts(c.result.high)}` : "");

function nameOf(names: Record<string, string>, id: string | null): string {
  return (id && names[id]) || "A member";
}

function label(c: InsightComparison, names: Record<string, string>): string {
  if (c.kind === "with-team") return `${nameOf(names, c.playerId)} with teammates, against alone`;
  if (c.kind === "with-teammate") return `${nameOf(names, c.playerId)} with ${nameOf(names, c.teammateId)}, against other teammates`;
  return `The team together, last ${RECENT_DAYS} days against earlier`;
}

/** The two sides' names, as the records line and the findings write them. */
function sides(c: InsightComparison, names: Record<string, string>): [string, string] {
  if (c.kind === "with-team") return ["With teammates", "Alone"];
  if (c.kind === "with-teammate") return [`With ${nameOf(names, c.teammateId)}`, "With other teammates"];
  return [`Last ${RECENT_DAYS} days`, "Earlier"];
}

const record = (wins: number, n: number) => (n ? `${rate(wins, n)} of ${games(n)}` : "no games");

function records(c: InsightComparison, names: Record<string, string>): string {
  const [exposed, other] = sides(c, names);
  return `${exposed}: ${record(c.result.exposed.wins, c.result.exposed.games)} · ${other}: ${record(c.result.other.wins, c.result.other.games)}`;
}

function headline(c: InsightComparison, names: Record<string, string>): string {
  const more = (c.result.difference ?? 0) > 0;
  const word = more ? "more" : "less";
  if (c.kind === "with-team") return `${nameOf(names, c.playerId)} has won ${word} often with teammates than alone.`;
  if (c.kind === "with-teammate") return `${nameOf(names, c.playerId)} has won ${word} often with ${nameOf(names, c.teammateId)} on the team.`;
  return `The team has won ${word} often together in the last ${RECENT_DAYS} days than earlier in the season.`;
}

function detail(c: InsightComparison, names: Record<string, string>): string {
  const e = c.result.exposed;
  const o = c.result.other;
  const d = c.result.difference!;
  if (c.kind === "with-team") {
    return `${rate(e.wins, e.games)} of ${games(e.games)} with teammates, ${rate(o.wins, o.games)} of ${games(o.games)} alone. Within the same game mode and role: ${points(d)}, ${interval(c)}.`;
  }
  if (c.kind === "with-teammate") {
    return `${rate(e.wins, e.games)} of ${games(e.games)} with ${nameOf(names, c.teammateId)}, ${rate(o.wins, o.games)} of ${games(o.games)} with other teammates. With the other teammates, the role and the game mode held equal: about ${points(d)}, ${interval(c)}.`;
  }
  return `${rate(e.wins, e.games)} of ${games(e.games)} in the last ${RECENT_DAYS} days, ${rate(o.wins, o.games)} of ${games(o.games)} before. Within the same game mode: ${points(d)}, ${interval(c)}.`;
}

function result(c: InsightComparison): string {
  if (!c.tested) {
    if (c.untestedReason === "inseparable") return "Not tested: these teammates have always played together, so their effects cannot be told apart";
    const shortest = Math.min(c.result.comparedGames.exposed, c.result.comparedGames.other);
    return `Needs ${MIN_GAMES_EACH_SIDE} comparable games on each side (has ${formatCount(shortest)})`;
  }
  return `${points(c.result.difference!)} (${pts(c.result.low!)} to ${pts(c.result.high!)})`;
}

const METHOD = [
  "Only the season's supported Summoner's Rift games are read; remakes and games without a result are left out. Several linked accounts of one member count once, and who was in a game comes from the game's stored record.",
  "A member's games are compared only within the same game mode and the same role, so playing another role or mode in one kind of game cannot make a difference by itself.",
  "With one teammate, the other teammates are held equal at the same time, so one strong teammate does not make the others look weak by their absence.",
  `A comparison is checked once it has ${MIN_GAMES_EACH_SIDE} games on each side. It stands out only when the difference is at least ${formatCount(MIN_FINDING_DIFFERENCE * 100)} points and unlikely to be chance after allowing for how many comparisons were checked (a ${formatCount(FALSE_DISCOVERY_RATE * 100)}% false discovery rate).`,
  "These describe the games played; they do not say why, and they do not predict the next game. Matchmaking adjusts opponents to results, and who plays together is a choice.",
];

/** The page's words for the team's insights. */
export function buildTeamInsightsPage(view: TeamInsightsView): TeamInsightsPageView {
  const { insights, names } = view;
  const findings: InsightFinding[] = pairedFindings(insights.findings).map(({ lead, mirror }) => ({
    key: lead.id,
    headline: headline(lead, names),
    detail: detail(lead, names),
    mirror: mirror ? `${headline(mirror, names)} ${detail(mirror, names)}` : null,
    span: span(lead.from, lead.to),
    direction: (lead.result.difference ?? 0) > 0 ? "more" : "less",
  }));
  return {
    title: "Team insights",
    scope: scopeLine(insights),
    findings,
    nothing: findings.length ? null : nothingLine(insights),
    method: METHOD,
    rows: insights.comparisons.map((c) => ({ key: c.id, label: label(c, names), records: records(c, names), result: result(c), status: c.finding ? "finding" : c.tested ? "chance" : "untested" })),
    excluded: excludedLine(insights),
  };
}

function scopeLine(r: TeamInsights): string {
  const dates = span(r.from, r.to);
  return `${seasonLabel(r.season)} · ${games(r.memberGames)} of ${formatCount(r.members)} member${r.members === 1 ? "" : "s"}, ${formatCount(r.teamGames)} played together${dates ? ` · ${dates}` : ""}`;
}

function nothingLine(r: TeamInsights): string {
  if (r.memberGames === 0) return "There are no games to compare yet: they appear here once members' Riot accounts have synced games this season.";
  if (r.tested === 0) return `Nothing has enough games to compare yet: a comparison needs ${MIN_GAMES_EACH_SIDE} games on each side.`;
  const margin = r.typicalMargin !== null ? ` With the games so far, a difference has to be around ${formatCount(r.typicalMargin * 100)} points or more before it can be told apart from chance.` : "";
  return `Nothing stands out. ${formatCount(r.tested)} comparison${r.tested === 1 ? " was" : "s were"} checked, and none differs by more than chance would explain.${margin}`;
}

function excludedLine(r: TeamInsights): string | null {
  const parts: string[] = [];
  if (r.excluded.noRecord) parts.push(`${games(r.excluded.noRecord)} without a stored record yet`);
  if (r.excluded.bothSides) parts.push(`${games(r.excluded.bothSides)} with one member's accounts on both sides`);
  return parts.length ? `Left out: ${parts.join(", ")}.` : null;
}
