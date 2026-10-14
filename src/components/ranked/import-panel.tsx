"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BLOCK_SIZE } from "@/domain/ranked-improvement";
import { ROLE_LABELS } from "@/domain/roles";
import { importRankedMatchAction } from "@/server/actions/ranked";
import type { ImportableMatch } from "@/server/ranked/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";
import type { JournalLookups } from "./types";

export interface ImportPanelProps {
  matches: ImportableMatch[];
  lookups: JournalLookups;
  /** How the owner's Riot accounts stand: none linked, linked but not synced yet, or synced. */
  accountState: "none" | "pending" | "synced";
}

/**
 * Optional shortcut: recent Solo/Duo games from the owner's synced Riot accounts, one tap to
 * import (champion, opponent, result, date and account are filled in; the reflection is added
 * afterwards). A game already in the journal never appears twice. Manual entry always works.
 */
export function ImportPanel({ matches, lookups, accountState }: ImportPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  const importOne = async (m: ImportableMatch) => {
    setBusy(m.matchId);
    const res = await importRankedMatchAction(m.matchId);
    setBusy(null);
    if (!res.ok) return void toast.error("Game not imported", { description: res.error });
    toast.success(res.data.blockCompleted ? `Imported. ${res.data.block.label} is complete at ${BLOCK_SIZE} games.` : `Imported into ${res.data.block.label}.`, res.data.blockCompleted ? undefined : { description: "Add the main mistake and notes from the game card." });
    router.refresh();
  };

  const empty =
    accountState === "none" ? (
      <p className="text-sm text-fg-muted">
        Link a Riot account under{" "}
        <Link href="/settings" className="text-accent hover:underline">
          My profile
        </Link>{" "}
        and recent Solo/Duo games appear here for one-tap import. Manual entry always works.
      </p>
    ) : accountState === "pending" ? (
      <p className="text-sm text-fg-muted">Your Riot account is linked and waiting for its first sync. Recent games appear here afterwards; manual entry works meanwhile.</p>
    ) : (
      <p className="text-sm text-fg-muted">No recent Solo/Duo games to import: everything synced is already in the journal, or there are no new games since the last sync.</p>
    );

  return (
    <Panel>
      <PanelHeader
        title="Add recent ranked game"
        subtitle={matches.length ? `${matches.length} synced Solo/Duo game${matches.length === 1 ? "" : "s"} not in your journal yet. Importing fills the facts; you add the reflection.` : "Optional shortcut from your synced Riot matches."}
        actions={matches.length ? <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Hide" : "Show games"}</Button> : null}
      />
      {open || matches.length === 0 ? (
        <PanelBody className="space-y-2">
          {matches.length === 0 ? (
            empty
          ) : (
            <ul className="space-y-1.5">
              {matches.map((m) => {
                const champion = lookups.championsById[m.championId] ?? { id: m.championId, name: m.championId, portraitUrl: "" };
                const enemy = m.enemyChampionId ? lookups.championsById[m.enemyChampionId] ?? { id: m.enemyChampionId, name: m.enemyChampionId, portraitUrl: "" } : null;
                return (
                  <li key={m.matchId} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elevated p-2">
                    <ChampionPortrait champion={champion} size="sm" />
                    {enemy ? <ChampionPortrait champion={enemy} size="sm" dimmed /> : null}
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="font-medium text-fg">{champion.name}</span>
                      {enemy ? <span className="text-fg-muted"> vs {enemy.name}</span> : null}
                      <span className="ml-1.5">
                        <Badge tone={m.win ? "blue" : "red"}>{m.win ? "Win" : "Loss"}</Badge>
                      </span>
                      <div className="text-xs text-fg-muted">
                        {formatDate(m.playedAt)}
                        {m.role ? ` · ${ROLE_LABELS[m.role]}` : ""}
                        {lookups.accounts.length > 1 ? ` · ${m.riotId}` : ""}
                        {m.gameDuration ? ` · ${Math.round(m.gameDuration / 60)} min` : ""}
                      </div>
                    </div>
                    <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => importOne(m)} className="max-sm:w-full">
                      {busy === m.matchId ? "Importing…" : "Import"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </PanelBody>
      ) : null}
    </Panel>
  );
}
