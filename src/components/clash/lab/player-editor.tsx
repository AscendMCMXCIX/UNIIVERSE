"use client";

import * as React from "react";
import { ClipboardPaste, Copy, CopyPlus, Eraser, MoreHorizontal } from "lucide-react";
import { ChampionPortrait } from "@/components/champion-portrait";
import type { PickerChampion } from "@/components/champion-picker";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { formatMastery, parseMasteryText } from "@/domain/clash-scout/mastery-input";
import { emptyLabPlayer, LAB_CHAMPIONS, type LabIssue, type LabPlayer } from "@/domain/clash-scout/lab";
import { TIERS, tierLabel } from "@/domain/clash-scout/edit";
import { formatCount } from "@/lib/format";

/*
  One opponent of a manual test: the name as the scouting screen shows it (no tag), five numbered
  mastery slots (champion, then points as the client writes them), and, optionally, the total
  mastery score and the rank. Each figure is read as it is typed and shown back with its precision
  ("150.4k: 150,350 to 150,449"), so a typing slip shows at once.
*/

const DIVISIONS = ["I", "II", "III", "IV"];
/** Tiers without divisions. */
const SINGLE = new Set(["UNRANKED", "MASTER", "GRANDMASTER", "CHALLENGER"]);

export interface PlayerEditorProps {
  slot: number;
  player: LabPlayer;
  championMap: ReadonlyMap<string, PickerChampion>;
  issues: LabIssue[];
  onChange: (next: LabPlayer) => void;
  onChooseChampion: (index: number) => void;
  onCopyTo: (target: number) => void;
  onPaste: () => void;
}

/** What a typed figure stands for, in words. */
function pointsHint(text: string): { ok: boolean; text: string } | null {
  if (!text.trim()) return null;
  const r = parseMasteryText(text);
  if (!r.ok) return { ok: false, text: r.error };
  const { points, precision } = r.value;
  return { ok: true, text: precision ? `${formatMastery(points, precision)}: ${formatCount(points - precision)} to ${formatCount(points + precision - 1)}` : `${formatCount(points)} exactly` };
}

export function PlayerEditor({ slot, player, championMap, issues, onChange, onChooseChampion, onCopyTo, onPaste }: PlayerEditorProps) {
  const at = (path: string) => issues.find((i) => i.path === `players.${slot}.${path}`)?.message ?? null;
  const set = (patch: Partial<LabPlayer>) => onChange({ ...player, ...patch });
  const setEntry = (i: number, patch: Partial<LabPlayer["champions"][number]>) => set({ champions: player.champions.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const id = `lab-p${slot}`;
  const nameIssue = at("name");
  const copyText = () => {
    const lines = player.champions.filter((c) => c.championId).map((c) => `${championMap.get(c.championId!)?.name ?? c.championId} ${c.points}`.trim());
    void navigator.clipboard?.writeText([player.name, ...lines].filter(Boolean).join("\n"));
  };

  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-3 sm:p-4" aria-labelledby={`${id}-title`} data-testid="lab-player" data-slot={slot}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
          Player {slot + 1}
        </h3>
        <Menu
          label={`Player ${slot + 1} actions`}
          testId="lab-player-menu"
          trigger={(t) => (
            <Button {...t} size="sm" variant="ghost" aria-label={`Player ${slot + 1} actions`} data-testid="lab-player-menu-button">
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          )}
        >
          <MenuItem icon={<ClipboardPaste className="h-4 w-4" />} onSelect={onPaste}>
            Paste lines…
          </MenuItem>
          <MenuItem icon={<Copy className="h-4 w-4" />} onSelect={copyText}>
            Copy as text
          </MenuItem>
          <MenuSeparator />
          {Array.from({ length: 5 }, (_, t) => t)
            .filter((t) => t !== slot)
            .map((t) => (
              <MenuItem key={t} icon={<CopyPlus className="h-4 w-4" />} onSelect={() => onCopyTo(t)}>
                Copy to Player {t + 1}
              </MenuItem>
            ))}
          <MenuSeparator />
          <MenuItem icon={<Eraser className="h-4 w-4" />} onSelect={() => onChange(emptyLabPlayer())}>
            Clear this player
          </MenuItem>
        </Menu>
      </div>

      <div>
        <Label htmlFor={`${id}-name`}>Name shown</Label>
        <Input id={`${id}-name`} value={player.name} maxLength={40} placeholder="As the client shows it" autoComplete="off" spellCheck={false} lang="" aria-invalid={!!nameIssue} aria-describedby={`${id}-name-help`} onChange={(e) => set({ name: e.target.value })} data-testid="lab-player-name" />
        <p id={`${id}-name-help`} className={cn("mt-1 text-2xs", nameIssue ? "text-bad" : "text-fg-subtle")} role={nameIssue ? "alert" : undefined}>
          {nameIssue ?? (player.name.includes("#") ? "With the tag, Riot checks this exact Riot ID: a verified identity, not a test of the matching." : "No tag needed. Add #TAG only to check an exact Riot ID.")}
        </p>
      </div>

      <ol className="space-y-2" aria-label={`Player ${slot + 1}'s five champions with the most mastery`}>
        {player.champions.slice(0, LAB_CHAMPIONS).map((c, i) => {
          const champ = c.championId ? championMap.get(c.championId) : null;
          const hint = pointsHint(c.points);
          const champIssue = at(`champions.${i}.championId`);
          const pointsIssue = at(`champions.${i}.points`);
          return (
            <li key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,7.5rem)] items-start gap-x-2 gap-y-1" data-testid="lab-entry" data-index={i}>
              <span className="pt-2.5 text-right text-xs tabular-nums text-fg-subtle" aria-hidden>
                {i + 1}.
              </span>
              <button
                type="button"
                onClick={() => onChooseChampion(i)}
                className={cn("flex min-h-10 min-w-0 items-center gap-2 rounded-md border px-1.5 text-left text-sm transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent", champIssue ? "border-bad/60" : "border-border")}
                aria-label={champ ? `Champion ${i + 1}: ${champ.name}. Change` : `Choose champion ${i + 1}`}
                data-testid="lab-entry-champion"
              >
                <ChampionPortrait champion={champ ?? null} size="xs" />
                <span className={cn("min-w-0 truncate", champ ? "text-fg" : "text-fg-subtle")}>{champ ? champ.name : "Choose"}</span>
              </button>
              <Input
                value={c.points}
                inputMode="decimal"
                placeholder="150k"
                maxLength={20}
                aria-label={`Mastery points for champion ${i + 1}`}
                aria-invalid={!!pointsIssue || (hint ? !hint.ok : false)}
                onChange={(e) => setEntry(i, { points: e.target.value })}
                className="tabular-nums"
                data-testid="lab-entry-points"
              />
              {champIssue || pointsIssue || hint ? (
                <p className={cn("col-start-2 col-end-4 text-2xs", champIssue || pointsIssue || (hint && !hint.ok) ? "text-bad" : "text-fg-subtle")} data-testid="lab-entry-hint">
                  {champIssue ?? pointsIssue ?? hint?.text}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <details className="group text-sm">
        <summary className="cursor-pointer list-none text-xs font-medium text-fg-muted hover:text-fg [&::-webkit-details-marker]:hidden">
          <span className="underline-offset-2 group-open:underline">Total mastery and rank (optional)</span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="col-span-2 sm:col-span-1">
            <Label htmlFor={`${id}-total`}>Total mastery score</Label>
            <Input id={`${id}-total`} value={player.totalScore} inputMode="numeric" placeholder="e.g. 811" maxLength={8} aria-invalid={!!at("totalScore")} onChange={(e) => set({ totalScore: e.target.value })} data-testid="lab-player-total" />
            {at("totalScore") ? <p className="mt-1 text-2xs text-bad">{at("totalScore")}</p> : null}
          </div>
          <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_5rem] gap-2 sm:col-span-1">
            <div>
              <Label htmlFor={`${id}-tier`}>Rank</Label>
              <Select id={`${id}-tier`} value={player.rank?.tier ?? ""} onChange={(e) => set({ rank: e.target.value ? { tier: e.target.value, division: SINGLE.has(e.target.value) ? null : (player.rank?.division ?? null) } : null })}>
                <option value="">Not given</option>
                {TIERS.map((tier) => (
                  <option key={tier} value={tier}>
                    {tierLabel(tier)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`${id}-division`}>Division</Label>
              <Select id={`${id}-division`} value={player.rank?.division ?? ""} disabled={!player.rank || SINGLE.has(player.rank.tier)} onChange={(e) => player.rank && set({ rank: { ...player.rank, division: e.target.value || null } })}>
                <option value="">—</option>
                {DIVISIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="col-span-2 text-2xs text-fg-subtle">The rank is kept for reference only: it changes too often to decide an identity.</p>
        </div>
      </details>
    </section>
  );
}
