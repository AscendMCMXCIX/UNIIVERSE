import type { AccountSyncView } from "./account-status";
import { multikillCoverage, type MultikillSummary } from "./multikills";

/*
  How up to date a page's Riot data is, in one place per page (components/ui/data-status.tsx).
  Every fact that used to sit beside a figure ("Partial", "from 50 of 1,103 games", "Updated 5m
  ago", a coverage dot) becomes one part here; the page shows the most important state as a word
  and the parts on request:

    Up to date       every linked account was read recently and every figure on the page is
                     complete;
    Syncing          Riot is still being read for this page's games (a new account, or a season
                     whose older games are still being collected);
    Partial data     the games are in, but some figures come from only some of them (multikill
                     counts or game details still being fetched);
    Delayed          no account was read for a while (Riot unavailable; retried automatically);
    Needs attention  an account cannot be read until someone acts (a Riot ID that does not exist);
    No Riot account  nothing to read.

  The words are a fixed vocabulary, so every page says the same thing about the same situation,
  and they never claim more than is known: a figure from some of the games says from how many.
*/

export type DataStatusState = "current" | "syncing" | "partial" | "delayed" | "attention" | "none";

/** The word for each state, the same on every page. */
export const DATA_STATUS_LABEL: Record<DataStatusState, string> = {
  current: "Up to date",
  syncing: "Syncing",
  partial: "Partial data",
  delayed: "Delayed",
  attention: "Needs attention",
  none: "No Riot account",
};

/** Most important first: the page shows the first state any of its parts has. */
const PRECEDENCE: DataStatusState[] = ["attention", "syncing", "delayed", "partial", "current", "none"];

export interface DataStatusPart {
  key: "accounts" | "season" | "multikills" | "details" | "positions" | "note";
  state: DataStatusState;
  /** One line: "Multikills counted in 277 of 1,104 games". */
  label: string;
  /** What it means and what happens next, when there is more to say. */
  detail: string | null;
}

export interface DataStatus {
  state: DataStatusState;
  label: string;
  /** The line shown beside the word: the part behind the state. */
  headline: string;
  parts: DataStatusPart[];
  /** When every linked account was last read successfully (the oldest of them), ISO. */
  checkedAt: string | null;
  /** The latest attempt to read any of them, successful or not, ISO: later than checkedAt when one failed since. */
  attemptedAt: string | null;
  /** The newest stored game, ISO. */
  newestGameAt: string | null;
}

export interface DataStatusFacts {
  /** Each linked account's sync state (describeAccountSync). */
  accounts: readonly AccountSyncView[];
  checkedAt: string | null;
  attemptedAt?: string | null;
  newestGameAt: string | null;
  /** How complete the season's games are (season figures pages). */
  season?: { complete: boolean; label: string; detail: string } | null;
  /** Multikill counts over this page's games. */
  multikills?: MultikillSummary | null;
  /** Games of this page with and without Riot's full record (KDA, CS, damage, vision); `unavailable`: games whose record Riot no longer serves, which will never have one. */
  details?: { games: number; detailed: number; unavailable?: number } | null;
  /** Games without a recorded position, left out of a role's figures. */
  unknownRole?: number;
  /** Anything else on the page that is still being collected (Match History: a page's items and runes). */
  notes?: ReadonlyArray<{ label: string; detail: string | null }>;
}

const n = (v: number) => v.toLocaleString("en");
const games = (k: number) => `${n(k)} game${k === 1 ? "" : "s"}`;

/** The accounts' part: the worst account decides (one that needs a person, then one being read, then a delay). */
function accountsPart(accounts: readonly AccountSyncView[], season: DataStatusFacts["season"]): DataStatusPart {
  const error = accounts.find((a) => a.state === "error");
  if (error) return { key: "accounts", state: "attention", label: accounts.length === 1 ? "The Riot account needs attention" : "A Riot account needs attention", detail: error.detail };
  if (accounts.some((a) => a.state === "pending" || a.state === "verified"))
    return { key: "accounts", state: "syncing", label: "Reading the linked Riot account for the first time", detail: "The first games, rank and mastery arrive within minutes; the page updates by itself." };
  if (accounts.some((a) => a.state === "syncing"))
    return { key: "accounts", state: "syncing", label: "Collecting this season's older games", detail: season?.detail ?? "Recent games, rank and mastery are in; older games of the season are added automatically and the figures grow as they arrive." };
  const stale = accounts.find((a) => a.state === "stale");
  if (stale) return { key: "accounts", state: "delayed", label: "Riot has not been read for a while", detail: stale.detail };
  return { key: "accounts", state: "current", label: "Games, rank and mastery are up to date", detail: null };
}

/**
 * The page's data status from what it already knows. Only facts that apply become parts: a page
 * without multikills says nothing about them, and a complete figure adds nothing.
 */
export function dataStatus(f: DataStatusFacts): DataStatus {
  const base = { checkedAt: f.checkedAt, attemptedAt: f.attemptedAt ?? null, newestGameAt: f.newestGameAt };
  if (f.accounts.length === 0) return { ...base, state: "none", label: DATA_STATUS_LABEL.none, headline: "Figures appear once a Riot account is linked and read.", parts: [] };
  const parts: DataStatusPart[] = [accountsPart(f.accounts, f.season)];
  // A season that is not complete for another reason than collection in progress (an earlier
  // season, kept only while tracked) is partial for good; collection in progress is the accounts' part.
  if (f.season && !f.season.complete && parts[0]!.state !== "syncing" && f.season.label !== "No Riot account")
    parts.push({ key: "season", state: "partial", label: f.season.label === "Partial Data" ? "Only part of the season's games are stored" : f.season.label, detail: f.season.detail });
  const m = f.multikills;
  if (m && m.games > 0 && m.counted < m.games) {
    const coverage = multikillCoverage(m);
    parts.push({ key: "multikills", state: "partial", label: m.counted ? `Multikills counted in ${n(m.counted)} of ${games(m.games)}` : `No multikill counts yet for these ${games(m.games)}`, detail: coverage.note });
  }
  const d = f.details;
  if (d && d.games > 0 && d.detailed < d.games) {
    // Games still to collect are said to be; games Riot no longer serves are said to be, so a
    // figure from some of the games never promises the rest when they will never come.
    const unavailable = Math.min(d.unavailable ?? 0, d.games - d.detailed);
    const pending = d.games - d.detailed - unavailable;
    const notes: string[] = [];
    if (pending > 0) notes.push(`Riot's full record of ${pending === 1 ? "1 older game is" : `${n(pending)} older games are`} still being collected; the results already count.`);
    if (unavailable > 0) notes.push(`Riot no longer provides the record${unavailable === 1 ? "" : "s"} of ${games(unavailable)}, so ${unavailable === 1 ? "its" : "their"} figures are left out; the results still count.`);
    parts.push({ key: "details", state: "partial", label: `Kills, KDA, CS, damage and vision from ${n(d.detailed)} of ${games(d.games)}`, detail: notes.join(" ") });
  }
  for (const note of f.notes ?? []) parts.push({ key: "note", state: "partial", label: note.label, detail: note.detail });
  if (f.unknownRole && f.unknownRole > 0) parts.push({ key: "positions", state: "partial", label: `${games(f.unknownRole)} without a recorded position left out of this role`, detail: "Riot recorded no position for these games, so they cannot count for a role. They still count with no role chosen." });
  const state = PRECEDENCE.find((s) => parts.some((p) => p.state === s)) ?? "current";
  const lead = parts.find((p) => p.state === state)!;
  return { ...base, state, label: DATA_STATUS_LABEL[state], headline: lead.label, parts };
}

/**
 * A team page's status (Team Leaderboards): every member's linked accounts at once, in the same
 * words, counted rather than named (each account's own story is on its player's profile). The
 * boards follow the account syncs, so that is said too: a game appears after the player's next
 * sync, or at once with the Refresh on their profile.
 */
export function teamDataStatus(f: { accounts: readonly AccountSyncView[]; checkedAt: string | null; attemptedAt: string | null; newestGameAt: string | null }): DataStatus {
  const base = { checkedAt: f.checkedAt, attemptedAt: f.attemptedAt, newestGameAt: f.newestGameAt };
  if (f.accounts.length === 0) return { ...base, state: "none", label: DATA_STATUS_LABEL.none, headline: "Figures appear once members link their Riot accounts.", parts: [] };
  const count = (states: AccountSyncView["state"][]) => f.accounts.filter((a) => states.includes(a.state)).length;
  const accounts = (k: number) => `${n(k)} member account${k === 1 ? "" : "s"}`;
  const parts: DataStatusPart[] = [];
  const attention = count(["error"]);
  if (attention) parts.push({ key: "accounts", state: "attention", label: `${accounts(attention)} need${attention === 1 ? "s" : ""} attention`, detail: "Their newest games may be missing here; the account on the player's profile (Riot accounts) says why." });
  const reading = count(["pending", "verified", "syncing"]);
  if (reading) parts.push({ key: "accounts", state: "syncing", label: `${accounts(reading)} still being read`, detail: "Their games are added automatically as Riot is read." });
  const stale = count(["stale"]);
  if (stale) parts.push({ key: "accounts", state: "delayed", label: `${accounts(stale)} not read for a while`, detail: "Riot is retried automatically; the games already stored still count." });
  if (!parts.length) parts.push({ key: "accounts", state: "current", label: "Every member's games, rank and mastery are up to date", detail: null });
  parts.push({ key: "note", state: "current", label: "The boards follow the account syncs", detail: "A new game appears after the player's next account sync, not live, or at once when they press Refresh on their profile." });
  const state = PRECEDENCE.find((s) => parts.some((p) => p.state === s)) ?? "current";
  return { ...base, state, label: DATA_STATUS_LABEL[state], headline: parts.find((p) => p.state === state)!.label, parts };
}
