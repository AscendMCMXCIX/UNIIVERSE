import type { CatchUpOutcome, RefreshOutcome } from "@/server/accounts/refresh";
import { formatCount } from "@/lib/format";

/** How a refresh's result reads: something new (good), nothing new (muted), a wait, not possible here (info), a failure (bad). */
export type RefreshTone = "good" | "muted" | "info" | "bad" | "wait";

const n = formatCount;
export const waitText = (s: number) => (s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`);

/**
 * The notification a refresh ends with (RefreshButton): done, with or without anything new (a
 * success); a wait (a notice); not possible here (a warning); a failure (an error).
 */
export const REFRESH_TOAST: Record<RefreshTone, "success" | "info" | "warning" | "error"> = { good: "success", muted: "success", wait: "info", info: "warning", bad: "error" };

/** What the two steps did, in one line (never "updated" unless something new arrived). */
export function refreshNote(games: RefreshOutcome, multikills: CatchUpOutcome | { status: "unavailable"; message: string } | null): { text: string; tone: RefreshTone; retryInSeconds: number } {
  const parts: string[] = [];
  let tone: RefreshTone = "muted";
  let retry = 0;
  switch (games.status) {
    case "updated":
      parts.push(`${n(games.newGames)} new game${games.newGames === 1 ? "" : "s"}`);
      tone = "good";
      break;
    case "no-new":
      parts.push("No new games");
      break;
    case "recent":
      parts.push("Games checked recently");
      retry = games.retryInSeconds;
      tone = "wait";
      break;
    case "failed":
      return { text: `Couldn't refresh: ${games.message}`, tone: "bad", retryInSeconds: 0 };
    case "unavailable":
      return { text: games.message, tone: "info", retryInSeconds: 0 };
  }
  if (multikills) {
    switch (multikills.status) {
      case "fetched":
        // The rest keep arriving through the hourly backfill (or the next Refresh): said, so a partial total is never mistaken for the end.
        parts.push(`multikills for ${n(multikills.fetched)} more game${multikills.fetched === 1 ? "" : "s"}; the other ${n(multikills.remaining)} follow automatically`);
        if (multikills.fetched > 0) tone = "good";
        break;
      case "complete":
        parts.push(multikills.fetched > 0 ? `the last ${n(multikills.fetched)} multikill count${multikills.fetched === 1 ? "" : "s"} are in` : "multikill counts complete");
        if (multikills.fetched > 0) tone = "good";
        break;
      case "recent":
        parts.push(`multikills fetched recently; ${n(multikills.remaining)} still to come`);
        retry = Math.max(retry, multikills.retryInSeconds);
        break;
      case "failed":
        parts.push(`multikills: ${multikills.message}`);
        break;
      case "unavailable":
        break;
    }
  }
  // An account that could not be read while the others were: said, with the warning tone, so
  // "no new games" never stands for a check that did not happen.
  if ((games.status === "updated" || games.status === "no-new") && games.problem) {
    parts.push(`${games.problem.accounts === 1 ? "1 account" : `${n(games.problem.accounts)} accounts`} could not be read: ${games.problem.message}`);
    tone = "info";
  }
  const text = parts.join(" · ");
  return { text: retry > 0 && tone !== "good" ? `${text} · try again in ${waitText(retry)}` : text, tone, retryInSeconds: retry };
}

