import { formatCount, formatDateTime, formatNumber } from "@/lib/format";
import type { HighEloOff } from "@/server/champion-builds/high-elo/switch";

/*
  Admin's view of the Master+ builds' collection (docs/HIGH_ELO_EVIDENCE.md): on or off, every reason
  it is off in words, what is stored and today's games. Read-only: it is switched on by the owner's
  environment variable and the enabling pull request, never here.
*/

export interface HighEloStateView {
  on: boolean;
  off: HighEloOff[];
  rows: number;
  bytes: number;
  maxBytes: number;
  gamesToday: number;
  dailyGames: number;
  lastSlice: { at: string; regions: string[] } | null;
}

const OFF_WORDS: Record<HighEloOff, string> = {
  "not-registered": "Riot registration: the ladder requests are not in this build",
  "switch-off": "Switch: UNIIVERSE_HIGH_ELO_COLLECTION is not on",
  "no-key": "No Riot key is set",
};

const mb = (bytes: number) => `${formatNumber(bytes / (1024 * 1024), 1)} MB`;

/** The lines the card shows, in order (pure, for its test). */
export function highEloLines(s: HighEloStateView): string[] {
  const stored = `Stored: ${formatCount(s.rows)} counts (${mb(s.bytes)} of ${mb(s.maxBytes)})`;
  if (!s.on) return [...s.off.map((o) => OFF_WORDS[o]), stored, `Last slice: ${s.lastSlice ? formatDateTime(s.lastSlice.at) : "none"}`];
  return [stored, `Today: ${formatCount(s.gamesToday)} games of ${formatCount(s.dailyGames)}`, s.lastSlice ? `Last slice: ${formatDateTime(s.lastSlice.at)}, ${s.lastSlice.regions.join(", ")}` : "Last slice: none yet"];
}

export function HighEloStateCard({ state }: { state: HighEloStateView }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm [overflow-wrap:anywhere]" data-testid="high-elo-state" data-collection={state.on ? "on" : "off"}>
      <div className="font-semibold text-fg">
        Master+ builds <span className={state.on ? "text-good" : "text-fg-muted"}>· {state.on ? "On" : "Off"}</span>
      </div>
      {highEloLines(state).map((line) => (
        <div key={line} className="text-fg-muted" data-testid="high-elo-line">
          {line}
        </div>
      ))}
      <div className="text-xs text-fg-subtle">Anonymous counts of Master+ Ranked Solo/Duo builds for Champion Intel; switched on only by the owner (docs/HIGH_ELO_EVIDENCE.md).</div>
    </div>
  );
}
