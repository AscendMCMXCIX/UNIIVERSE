"use client";

import * as React from "react";
import { BadgeCheck, Copy, ExternalLink, History, Search } from "lucide-react";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatPoints, formatRank, needsCheck } from "@/domain/clash-scout/edit";
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

/**
 * One opponent: name (with how sure the reading is and, when unsure, the name as it appears in
 * the screenshot), rank, the ranked champions and mastery, whether the account is verified, and a
 * way to look the player up. The card opens the full detail.
 */
export function ScoutCard({ player, platform, champions, crop, earlier, onOpen }: { player: ScoutPlayer; platform: string; champions: ReadonlyMap<string, PortraitChampion>; crop: string | null; earlier: EarlierView[]; onOpen: () => void }) {
  const check = needsCheck(player);
  const profile = verifiedProfileUrl(player, platform);
  const rank = formatRank(player.rank);
  const empty = !player.name && !player.rank && !player.ranked.length && !player.mastery.length;
  return (
    <article className="flex h-full min-w-0 flex-col gap-3 rounded-panel border border-border bg-surface p-3 shadow-sm" data-testid="scout-card" data-slot={player.slot} aria-label={player.name || `Player ${player.slot + 1}`}>
      <header className="min-w-0 space-y-1.5">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-accent" data-testid="scout-card-open">
            <span className="block text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Player {player.slot + 1}</span>
            <span className={cn("block break-words text-base font-semibold leading-snug", player.name ? "text-fg" : "text-fg-subtle")} data-testid="scout-card-name" lang="">
              {player.name || "Not read yet"}
            </span>
          </button>
          {player.verification === "verified" ? (
            <BadgeCheck className="mt-4 h-4 w-4 shrink-0 text-good" aria-label="Riot account verified" data-testid="scout-card-verified" />
          ) : null}
        </div>
        {check.name && crop ? (
          // eslint-disable-next-line @next/next/no-img-element -- a crop of the member's own screenshot, kept in this page only
          <img src={crop} alt="The name as it appears in the screenshot" className="h-7 max-w-full rounded-sm border border-warn/40 object-contain object-left" data-testid="scout-card-crop" />
        ) : null}
        <div className="flex flex-wrap gap-1">
          {player.verification === "verified" ? <Badge tone="good">Verified</Badge> : player.name ? <Badge title="Only the name is known: it could belong to more than one account.">Unverified</Badge> : null}
          {check.name ? (
            <Badge tone="warn" title="Read with low confidence: check it against the screenshot.">
              Check name
            </Badge>
          ) : null}
          {earlier.length ? (
            <Badge tone="info" title={`Scouted before: ${earlier.map((e) => `${e.opponentName} (${new Date(e.scoutedAt).toLocaleDateString()})`).join(", ")}`}>
              <History className="h-3 w-3" aria-hidden />
              Seen before
            </Badge>
          ) : null}
        </div>
      </header>

      {rank ? <p className="text-sm text-fg-muted" data-testid="scout-card-rank">{rank}</p> : null}

      {player.ranked.length ? (
        <section aria-label="Ranked champions" className="space-y-1.5">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Ranked</h3>
          <ul className="space-y-1.5">
            {player.ranked.map((c, i) => (
              <li key={i} className="flex min-w-0 items-center gap-2 text-sm" data-testid="scout-ranked-row">
                <ChampionPortrait champion={c.championId ? champions.get(c.championId) : null} size="xs" title={c.championId ? undefined : "Champion not recognised"} />
                <span className="min-w-0 leading-tight tabular-nums">
                  <span className="text-fg">{[c.winRate !== null ? `${c.winRate}%` : null, c.games !== null ? `${c.games} games` : null].filter(Boolean).join(" · ") || "—"}</span>
                  {c.kda !== null ? <span className="block text-xs text-fg-muted">{c.kda.toFixed(2)} KDA</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {player.mastery.length ? (
        <section aria-label="Champion mastery" className="space-y-1.5">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">Mastery</h3>
          <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
            {player.mastery.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5 text-sm" data-testid="scout-mastery-row">
                <ChampionPortrait champion={c.championId ? champions.get(c.championId) : null} size="xs" title={c.championId ? undefined : "Champion not recognised"} />
                <span className="tabular-nums text-fg-muted">
                  {c.level !== null ? <span className="text-fg">M{c.level}</span> : null}
                  {c.level !== null && c.points !== null ? " · " : null}
                  {formatPoints(c.points)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {empty ? <p className="text-sm text-fg-subtle">Nothing read for this player yet.</p> : null}
      {check.champions ? <p className="text-xs text-warn">{check.champions === 1 ? "1 champion" : `${check.champions} champions`} to check</p> : null}

      <footer className="mt-auto flex flex-wrap gap-1.5 pt-1">
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
          <Button size="sm" variant="ghost" onClick={onOpen} data-testid="scout-card-lookup">
            <Search className="h-3.5 w-3.5" aria-hidden />
            Look up
          </Button>
        ) : null}
      </footer>
    </article>
  );
}
