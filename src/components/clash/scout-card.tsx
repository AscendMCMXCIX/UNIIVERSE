"use client";

import * as React from "react";
import { AlertTriangle, BadgeCheck, Check, Copy, ExternalLink, History, Maximize2, Pencil, ScanText, Search } from "lucide-react";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatPoints, formatRank, nameAlternatives, nameSource, needsCheck, type NameSource } from "@/domain/clash-scout/edit";
import { verifiedProfileUrl } from "@/domain/clash-scout/links";
import type { ScoutPlayer } from "@/domain/clash-scout/types";
import { cn } from "@/lib/cn";
import { copyText } from "./copy-text";

export interface EarlierView {
  scoutId: string;
  opponentName: string;
  scoutedAt: string;
}

export async function copyName(name: string) {
  if (await copyText(name)) toast.success("Name copied", { description: name, duration: 2000 });
  else toast.error("The browser did not allow copying. Select the name and copy it by hand.");
}

/** How each kind of name is labelled under it: where it came from, in a few words. */
export const SOURCE_LABEL: Record<Exclude<NameSource, "none">, { text: string; title: string }> = {
  verified: { text: "Riot verified", title: "Riot confirmed this exact Riot ID." },
  read: { text: "From the screenshot", title: "Read clearly from the screenshot. A name alone is not an account: it is not verified." },
  check: { text: "Check the name", title: "Read with low confidence, or the two screenshots read it differently: compare it with the screenshot." },
  confirmed: { text: "Confirmed", title: "A member confirmed the name as it was read. Not verified with Riot." },
  corrected: { text: "Corrected", title: "A member corrected the name the screenshot gave. Not verified with Riot." },
  entered: { text: "Entered", title: "Typed by a member: no screenshot read it. Not verified with Riot." },
};

const SOURCE_ICON: Record<Exclude<NameSource, "none">, React.ReactNode> = {
  verified: <BadgeCheck className="h-3.5 w-3.5 text-good" aria-hidden />,
  read: <ScanText className="h-3.5 w-3.5" aria-hidden />,
  check: <AlertTriangle className="h-3.5 w-3.5 text-warn" aria-hidden />,
  confirmed: <Check className="h-3.5 w-3.5" aria-hidden />,
  corrected: <Pencil className="h-3.5 w-3.5" aria-hidden />,
  entered: <Pencil className="h-3.5 w-3.5" aria-hidden />,
};

/** A KDA as the client prints it: one decimal ("7.1"), or two when it has them ("3.21"). */
export const formatKda = (kda: number) => kda.toFixed(Math.round(kda * 100) % 10 === 0 ? 1 : 2);

/** A champion row's figures are in doubt: not all read, or its two readings disagreed. */
const doubtful = (c: { certainty: string }) => c.certainty === "low";

export interface ScoutCardProps {
  player: ScoutPlayer;
  platform: string;
  champions: ReadonlyMap<string, PortraitChampion>;
  /** The name as it appears in the screenshot (this page only), shown when the reading is unsure. */
  crop: string | null;
  earlier: EarlierView[];
  editable: boolean;
  /** Which screenshots are in (a missing section then says so). */
  shown: { ranked: boolean; mastery: boolean };
  onOpen: () => void;
  onRename: (name: string) => void;
  onConfirm: () => void;
}

/**
 * One opponent: the name, where it came from, and its correction in place; the rank, the ranked
 * champions and the mastery, each section in the same place on every card so five players compare
 * at a glance; and a way to look the player up. "Details" opens the player in full.
 */
export function ScoutCard({ player, platform, champions, crop, earlier, editable, shown, onOpen, onRename, onConfirm }: ScoutCardProps) {
  const source = nameSource(player);
  const alternatives = source === "check" || source === "corrected" ? nameAlternatives(player) : [];
  const profile = verifiedProfileUrl(player, platform);
  const rank = formatRank(player.rank);
  const [editing, setEditing] = React.useState(false);
  const lowRows = needsCheck(player).rows;

  return (
    <article
      className="flex h-full min-w-0 flex-col gap-3 rounded-panel border border-border bg-surface p-3 shadow-sm @3xl:row-span-5 @3xl:grid @3xl:grid-rows-subgrid @3xl:gap-y-3"
      data-testid="scout-card"
      data-slot={player.slot}
      aria-label={player.name || `Player ${player.slot + 1}`}
    >
      <header className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-1">
          <span className="flex-1 text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Player {player.slot + 1}</span>
          {earlier.length ? (
            <Badge tone="info" title={`Scouted before: ${earlier.map((e) => `${e.opponentName} (${new Date(e.scoutedAt).toLocaleDateString()})`).join(", ")}`}>
              <History className="h-3 w-3" aria-hidden />
              Seen before
            </Badge>
          ) : null}
          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={onOpen} aria-label={`Details of ${player.name || `player ${player.slot + 1}`}`} title="Details" data-testid="scout-card-open">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>

        {editing ? (
          <NameEditor
            initial={player.name}
            onDone={(name) => {
              setEditing(false);
              if (name !== null && name !== player.name) onRename(name);
            }}
          />
        ) : (
          <div className="group flex min-w-0 items-start gap-1">
            <span className={cn("min-w-0 break-words text-base font-semibold leading-snug", player.name ? "text-fg" : "font-normal text-fg-subtle")} data-testid="scout-card-name" lang="">
              {player.name || "Not read"}
            </span>
            {player.verification === "verified" ? <BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-good" aria-label="Riot account verified" data-testid="scout-card-verified" /> : null}
            {editable ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded text-fg-subtle opacity-70 transition-opacity hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
                aria-label={player.name ? `Correct the name ${player.name}` : `Enter player ${player.slot + 1}'s name`}
                data-testid="scout-card-edit-name"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        )}

        {source !== "none" && !editing ? (
          <p className={cn("flex items-center gap-1 text-xs", source === "check" ? "text-warn" : "text-fg-subtle")} title={SOURCE_LABEL[source].title} data-testid="scout-card-source" data-source={source}>
            {SOURCE_ICON[source]}
            <span className="min-w-0 truncate">
              {SOURCE_LABEL[source].text}
              {source === "corrected" && alternatives[0] ? ` · read as “${alternatives[0]}”` : ""}
            </span>
          </p>
        ) : null}

        {source === "check" && !editing ? (
          <div className="space-y-1 rounded-md border border-warn/30 bg-warn/5 p-1.5" data-testid="scout-card-check">
            {crop ? (
              // eslint-disable-next-line @next/next/no-img-element -- a crop of the member's own screenshot, kept in this page only
              <img src={crop} alt="The name as it appears in the screenshot" className="h-6 max-w-full rounded-sm object-contain object-left" data-testid="scout-card-crop" />
            ) : null}
            {editable ? (
              <div className="flex flex-wrap items-center gap-1">
                <Button size="sm" onClick={onConfirm} data-testid="scout-card-confirm">
                  <Check className="h-3.5 w-3.5" aria-hidden /> Looks right
                </Button>
                {alternatives.map((a) => (
                  <Button key={a} size="sm" variant="ghost" className="max-w-full" onClick={() => onRename(a)} title={`Use “${a}”: the other screenshot read it this way`} data-testid="scout-card-use-alt" lang="">
                    <span className="truncate">Or “{a}”</span>
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="min-w-0 space-y-0.5 text-sm" data-testid="scout-card-rank-row">
        {rank ? (
          <p className="flex items-center gap-1.5 text-fg" data-testid="scout-card-rank">
            {rank}
            {player.rankCertainty === "low" ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Rank read with low confidence: check it" aria-label="Check the rank" /> : null}
          </p>
        ) : shown.ranked ? (
          <p className="text-fg-subtle">No rank shown</p>
        ) : null}
        {typeof player.totalMastery === "number" ? (
          <p className="text-xs text-fg-muted" data-testid="scout-card-total">
            <span className="tabular-nums text-fg">{player.totalMastery.toLocaleString()}</span> total mastery
          </p>
        ) : null}
      </div>

      <section aria-label="Ranked champions" className="min-w-0 space-y-1.5">
        {player.ranked.length ? (
          <>
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Ranked</h3>
            <ul className="space-y-1.5">
              {player.ranked.map((c, i) => (
                <li key={i} className="flex min-w-0 items-center gap-2 text-sm" data-testid="scout-ranked-row">
                  <ChampionPortrait champion={c.championId ? champions.get(c.championId) : null} size="xs" title={c.championId ? undefined : "Champion not recognised"} />
                  <span className="min-w-0 flex-1 leading-tight tabular-nums">
                    <span className="text-fg">{[c.winRate !== null ? `${c.winRate}%` : null, c.games !== null ? `${c.games} ${c.games === 1 ? "game" : "games"}` : null].filter(Boolean).join(" · ") || "—"}</span>
                    {c.kda !== null ? <span className="block text-xs text-fg-muted">{formatKda(c.kda)} KDA</span> : null}
                  </span>
                  {doubtful(c) ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Not all of this row could be read surely: check it" /> : null}
                </li>
              ))}
            </ul>
          </>
        ) : shown.ranked ? (
          <p className="text-xs text-fg-subtle">No ranked champions read</p>
        ) : null}
      </section>

      <section aria-label="Champion mastery" className="min-w-0 space-y-1.5">
        {player.mastery.length ? (
          <>
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Mastery</h3>
            <ul className="space-y-1.5">
              {player.mastery.map((c, i) => (
                <li key={i} className="flex min-w-0 items-center gap-2 text-sm" data-testid="scout-mastery-row">
                  <ChampionPortrait champion={c.championId ? champions.get(c.championId) : null} size="xs" title={c.championId ? undefined : "Champion not recognised"} />
                  <span className="min-w-0 flex-1 tabular-nums text-fg-muted">
                    {c.points !== null ? <span className="text-fg">{formatPoints(c.points)}</span> : "—"}
                    {c.level !== null ? ` · Lv ${c.level}` : null}
                  </span>
                  {doubtful(c) ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Not all of this row could be read surely: check it" /> : null}
                </li>
              ))}
            </ul>
          </>
        ) : shown.mastery ? (
          <p className="text-xs text-fg-subtle">No mastery read</p>
        ) : null}
      </section>

      <footer className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 @3xl:mt-0 @3xl:self-start">
        {player.name ? (
          <Button size="sm" variant="ghost" onClick={() => void copyName(player.name)} aria-label={`Copy the name ${player.name}`} title="Copy the name exactly" data-testid="scout-card-copy">
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copy
          </Button>
        ) : null}
        {profile ? (
          <a href={profile} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")} data-testid="scout-card-opgg">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            OP.GG
          </a>
        ) : player.name ? (
          <Button size="sm" variant="ghost" onClick={onOpen} title="Find the account: copy the name for OP.GG, or check a full Riot ID with Riot" data-testid="scout-card-lookup">
            <Search className="h-3.5 w-3.5" aria-hidden />
            Look up
          </Button>
        ) : null}
        {lowRows ? (
          <span className="ml-auto text-xs text-fg-subtle" title="Rows marked with a dot could not all be read surely.">
            {lowRows} to check
          </span>
        ) : null}
      </footer>
    </article>
  );
}

/** The name, corrected in place: Enter or leaving the field keeps it, Escape cancels. Any script is kept exactly as typed. */
function NameEditor({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = React.useState(initial);
  const done = React.useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name === null ? null : name.trim());
  };
  return (
    <input
      autoFocus
      value={value}
      maxLength={48}
      spellCheck={false}
      autoComplete="off"
      aria-label="Player name"
      className="h-8 w-full min-w-0 rounded-md border border-accent bg-bg px-2 text-base font-semibold text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        // Enter or Escape while an input method composes (Korean, Japanese, Chinese) belongs to the composition.
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") finish(value);
        else if (e.key === "Escape") finish(null);
      }}
      onBlur={() => finish(value)}
      data-testid="scout-card-name-input"
    />
  );
}
