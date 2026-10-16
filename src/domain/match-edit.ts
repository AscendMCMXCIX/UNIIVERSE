import { ROLES, type Role } from "./roles";
import type { CompetitionMode } from "./competition";
import { enemyNameList, enemySlotsFromList } from "./scouting/enemy-slots";
import { localDateKey, moveToLocalDate } from "./match-time";

/*
  Editing a saved match record without ever overwriting what the person did not touch.

  The editor keeps only the person's own edits. Every other field always shows the record as the
  server last sent it, so when something else changes the record (linking a Riot game fetches the
  result, duration and date; another editor saves), the untouched fields follow at once. Saving
  sends only the edited fields, together with the version (`updatedAt`) the edits were made
  against; the server refuses a save made against an older version (see `updateMatchIfUnchanged`).
*/

export type MatchResultValue = "win" | "loss" | "cancelled";

/** A match record as the editor receives it from the server. */
export interface EditableMatch {
  result: MatchResultValue | null;
  durationSeconds: number | null;
  riotMatchId: string | null;
  notes: string;
  vodUrl: string;
  /** ISO instant. */
  playedAt: string;
  eventName: string;
  opponentName: string;
  enemyPlayers: Partial<Record<Role, string>>;
  mode: CompetitionMode;
}

/** The form's values: what the inputs show. `playedOn` is the local calendar date. */
export interface MatchForm {
  result: MatchResultValue | "";
  minutes: string;
  riotMatchId: string;
  notes: string;
  vodUrl: string;
  playedOn: string;
  eventName: string;
  opponentName: string;
  enemyPlayers: string[];
  mode: CompetitionMode;
}

export type MatchFormKey = keyof MatchForm;
export type MatchEdits = Partial<MatchForm>;

/** What the server accepts: only the fields being changed. */
export interface MatchPatch {
  result?: MatchResultValue | null;
  durationSeconds?: number | null;
  riotMatchId?: string | null;
  notes?: string;
  vodUrl?: string;
  playedAt?: string;
  eventName?: string;
  opponentName?: string;
  enemyPlayers?: Record<Role, string>;
  mode?: CompetitionMode;
}

export function formFromMatch(match: EditableMatch, timeZone: string): MatchForm {
  return {
    result: match.result ?? "",
    minutes: match.durationSeconds ? String(Math.round(match.durationSeconds / 60)) : "",
    riotMatchId: match.riotMatchId ?? "",
    notes: match.notes,
    vodUrl: match.vodUrl,
    playedOn: localDateKey(match.playedAt, timeZone),
    eventName: match.eventName,
    opponentName: match.opponentName,
    enemyPlayers: enemyNameList(match.enemyPlayers),
    mode: match.mode,
  };
}

function same<K extends MatchFormKey>(key: K, a: MatchForm[K], b: MatchForm[K]): boolean {
  if (key === "enemyPlayers") return JSON.stringify((a as string[]).map((s) => s.trim()).filter(Boolean)) === JSON.stringify((b as string[]).map((s) => s.trim()).filter(Boolean));
  return a === b;
}

/** The value an input shows: the person's edit when there is one, else the server's value. */
export function shownValue<K extends MatchFormKey>(edits: MatchEdits, server: MatchForm, key: K): MatchForm[K] {
  return (key in edits ? edits[key] : server[key]) as MatchForm[K];
}

/** Records an edit; typing a field back to the server's value removes the edit again. */
export function withEdit<K extends MatchFormKey>(edits: MatchEdits, server: MatchForm, key: K, value: MatchForm[K]): MatchEdits {
  const next = { ...edits };
  if (same(key, value, server[key])) delete next[key];
  else next[key] = value;
  return next;
}

/** Edits that still differ from the server's current values (an edit the server now matches is done). */
export function pendingEdits(edits: MatchEdits, server: MatchForm): MatchEdits {
  const out: MatchEdits = {};
  for (const key of Object.keys(edits) as MatchFormKey[]) {
    if (!same(key, edits[key] as never, server[key] as never)) (out as Record<string, unknown>)[key] = edits[key];
  }
  return out;
}

/**
 * The patch for a save: one entry per edited field, nothing else. A changed date keeps the
 * record's local time of day (`moveToLocalDate`); an untouched date is not sent at all.
 */
export function buildMatchPatch(edits: MatchEdits, match: EditableMatch, timeZone: string): MatchPatch {
  const patch: MatchPatch = {};
  if (edits.result !== undefined) patch.result = edits.result === "" ? null : edits.result;
  if (edits.minutes !== undefined) {
    const n = Number(edits.minutes.trim());
    patch.durationSeconds = edits.minutes.trim() && Number.isFinite(n) ? Math.round(n * 60) : null;
  }
  if (edits.riotMatchId !== undefined) patch.riotMatchId = edits.riotMatchId.trim() || null;
  if (edits.notes !== undefined) patch.notes = edits.notes;
  if (edits.vodUrl !== undefined) patch.vodUrl = edits.vodUrl;
  if (edits.playedOn !== undefined && edits.playedOn) patch.playedAt = moveToLocalDate(match.playedAt, edits.playedOn, timeZone);
  if (edits.eventName !== undefined) patch.eventName = edits.eventName;
  if (edits.opponentName !== undefined) patch.opponentName = edits.opponentName;
  // Every slot is sent (blank ones clear what was there before).
  if (edits.enemyPlayers !== undefined) patch.enemyPlayers = Object.fromEntries(ROLES.map((r) => [r, enemySlotsFromList(edits.enemyPlayers!)[r] ?? ""])) as Record<Role, string>;
  if (edits.mode !== undefined) patch.mode = edits.mode;
  return patch;
}
