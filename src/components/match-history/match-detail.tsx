"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, NotebookPen, X } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { getMatchDetailAction } from "@/server/actions/match-history";
import { importRankedMatchAction } from "@/server/actions/ranked";
import type { DetailParticipant, DetailTeam, MatchDetailResult, MatchDetailView } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { BlockSizeInput } from "@/components/ranked/current-block-panel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { IconImg, ItemRow, fmtDuration, fmtInt, fmtNum } from "./match-history-view";

const OBJECTIVES: Array<[string, string, string]> = [
  ["tower", "tower", "towers"],
  ["dragon", "dragon", "dragons"],
  ["baron", "baron", "barons"],
  ["horde", "voidgrub", "voidgrubs"],
  ["riftHerald", "herald", "heralds"],
  ["inhibitor", "inhibitor", "inhibitors"],
];

/**
 * One match, over the page: a drawer from the right on wider screens, the full screen on a phone.
 * The rest of the history stays where it was; Escape, the close button or Back return to it.
 * The record loads when opened (and is fetched once from Riot if it was not collected yet).
 */
export function MatchDetailDrawer({ playerId, matchId, championsById, onClose }: { playerId: string; matchId: string; championsById: Record<string, PortraitChampion>; onClose: () => void }) {
  const [result, setResult] = React.useState<MatchDetailResult | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    let live = true;
    void getMatchDetailAction(playerId, matchId).then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [playerId, matchId]);
  React.useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const champ = (id: string | null): PortraitChampion => (id ? (championsById[id] ?? { id, name: id, portraitUrl: "" }) : { id: "unknown", name: "Unknown", portraitUrl: "" });
  const view = result?.status === "ok" ? result.view : null;
  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-[2px] motion-safe:animate-[fade-in_150ms_ease-out]" aria-label="Close the match details" tabIndex={-1} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-detail-title"
        className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-bg shadow-2xl sm:max-w-3xl motion-safe:drawer-in"
        data-testid="match-detail"
      >
        <header className={cn("flex items-start justify-between gap-3 border-b border-border px-4 py-3", view ? (view.win ? "bg-blue/10" : "bg-red/10") : "bg-surface")}>
          {view ? (
            <div className="flex min-w-0 items-center gap-3">
              <ChampionPortrait champion={champ(view.championId)} size="md" />
              <div className="min-w-0">
                <h2 id="match-detail-title" className="flex flex-wrap items-baseline gap-2 text-lg font-semibold text-fg">
                  <span className={view.win ? "text-blue" : "text-red"}>
                    <span aria-hidden>{view.win ? "▲ " : "▼ "}</span>
                    {view.win ? "Victory" : "Defeat"}
                  </span>
                  <span className="truncate">{champ(view.championId).name}</span>
                </h2>
                <p className="text-xs text-fg-muted">
                  {view.queue} · {fmtDuration(view.durationS)} · {formatDate(new Date(view.playedAt))}
                  {view.patch ? ` · patch ${view.patch}` : ""}
                  {view.role && view.role !== "UNKNOWN" ? ` · ${ROLE_LABELS[view.role as Role] ?? view.role}` : ""}
                </p>
              </div>
            </div>
          ) : (
            <h2 id="match-detail-title" className="text-lg font-semibold text-fg">
              Match details
            </h2>
          )}
          <button ref={closeRef} type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label="Close" data-testid="match-detail-close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" data-testid="match-detail-body">
          {!result ? <DetailSkeleton /> : result.status !== "ok" ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="match-detail-message">{result.message}</p> : <DetailBody view={view!} champ={champ} />}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the match">
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-xl bg-surface-2" />
      ))}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface px-2.5 py-2">
      <div className="text-[11px] text-fg-subtle">{label}</div>
      <div className="text-base font-semibold tabular-nums text-fg">{value}</div>
    </div>
  );
}

function DetailBody({ view, champ }: { view: MatchDetailView; champ: (id: string | null) => PortraitChampion }) {
  const p = view.player;
  return (
    <div className="space-y-4">
      <section aria-label="Your performance" className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex gap-0.5">{p.spells?.map((s, i) => <IconImg key={i} icon={s} size={26} />)}</span>
          <span className="flex items-center gap-0.5">
            <IconImg icon={p.keystone} size={28} rounded="rounded-full" />
            <IconImg icon={p.secondary} size={20} rounded="rounded-full" />
          </span>
          <ItemRow items={p.items} size={28} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="match-detail-figures">
          <Figure label="KDA" value={`${p.kills} / ${p.deaths} / ${p.assists}`} />
          <Figure label="KDA ratio" value={p.deaths === 0 ? "Perfect" : p.kda.toFixed(2)} />
          <Figure label="CS/min" value={fmtNum(p.csPerMin)} />
          <Figure label="Damage/min" value={fmtInt(p.damagePerMin)} />
          <Figure label="Kill participation" value={p.killParticipation === null ? "—" : `${Math.round(p.killParticipation * 100)}%`} />
          <Figure label="Vision score" value={fmtInt(p.vision)} />
          <Figure label="Gold" value={fmtInt(p.gold)} />
          <Figure label="Damage taken" value={fmtInt(p.damageTaken)} />
        </div>
        {view.journal.eligible ? <JournalButton matchId={view.matchId} inJournal={view.journal.inJournal} /> : null}
      </section>
      {view.teams.map((t) => (
        <TeamTable key={t.teamId} team={t} champ={champ} maxDamage={view.maxDamage} />
      ))}
    </div>
  );
}

function TeamTable({ team, champ, maxDamage }: { team: DetailTeam; champ: (id: string | null) => PortraitChampion; maxDamage: number }) {
  const objectives = OBJECTIVES.filter(([k]) => team.objectives[k] !== undefined);
  return (
    <section className={cn("overflow-hidden rounded-xl border", team.win ? "border-blue/30" : "border-red/30")} data-testid={`team-${team.side}`} aria-label={`${team.side === "blue" ? "Blue" : "Red"} team, ${team.win ? "victory" : "defeat"}`}>
      <header className={cn("flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs", team.win ? "bg-blue/10" : "bg-red/10")}>
        <span className="font-semibold uppercase tracking-wide">
          <span className={team.side === "blue" ? "text-blue" : "text-red"}>{team.side === "blue" ? "Blue side" : "Red side"}</span> · {team.win ? "Victory" : "Defeat"}
        </span>
        <span className="flex flex-wrap gap-x-3 text-fg-muted">
          <span>{team.kills} kills</span>
          {team.gold !== null ? <span>{(team.gold / 1000).toFixed(1)}k gold</span> : null}
          {objectives.map(([k, one, many]) => (
            <span key={k}>
              {team.objectives[k]} {team.objectives[k] === 1 ? one : many}
            </span>
          ))}
        </span>
      </header>
      <ul className="divide-y divide-border/70">
        {team.participants.map((x, i) => (
          <ParticipantRow key={i} x={x} champ={champ} maxDamage={maxDamage} />
        ))}
      </ul>
      {team.bans.length ? (
        <footer className="flex items-center gap-1.5 border-t border-border/70 px-3 py-1.5 text-[11px] text-fg-subtle">
          Bans
          {team.bans.map((b) => (
            <ChampionPortrait key={b} champion={champ(b)} size="xs" dimmed title={champ(b).name} />
          ))}
        </footer>
      ) : null}
    </section>
  );
}

function ParticipantRow({ x, champ, maxDamage }: { x: DetailParticipant; champ: (id: string | null) => PortraitChampion; maxDamage: number }) {
  const c = champ(x.championId);
  return (
    <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-1.5 sm:grid-cols-[minmax(0,1.4fr)_5rem_8.75rem_minmax(0,1fr)]", x.isPlayer && "bg-accent/10")} data-testid="participant" data-player={x.isPlayer || undefined}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative shrink-0">
          <ChampionPortrait champion={c} size="sm" />
          {x.champLevel !== null ? <span className="absolute -bottom-1 -right-1 rounded bg-bg px-0.5 text-[10px] font-semibold tabular-nums text-fg-muted">{x.champLevel}</span> : null}
        </span>
        <span className="hidden flex-col gap-0.5 sm:flex">
          <span className="flex gap-0.5">{x.spells?.map((s, i) => <IconImg key={i} icon={s} size={14} />)}</span>
          <IconImg icon={x.keystone} size={14} rounded="rounded-full" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className={cn("block truncate text-sm", x.isPlayer ? "font-semibold text-fg" : "text-fg")}>{x.name ?? c.name}</span>
          <span className="block truncate text-[11px] text-fg-subtle">
            {c.name}
            {x.teamMember && !x.isPlayer ? <span className="text-accent"> · {x.teamMember}</span> : null}
          </span>
        </span>
      </span>
      <span className="text-right leading-tight sm:text-left">
        <span className="block text-sm font-semibold tabular-nums">
          {x.kills}/{x.deaths}/{x.assists}
        </span>
        <span className="block text-[11px] tabular-nums text-fg-subtle">{x.deaths === 0 ? "Perfect" : `${x.kda.toFixed(2)} KDA`}</span>
      </span>
      <span className="leading-tight max-sm:col-span-2" title={x.damage !== null ? `${x.damage.toLocaleString("en")} damage to champions` : undefined}>
        <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-fg-muted">
          {fmtInt(x.damage)} dmg
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <span className="block h-full rounded-full bg-accent/70" style={{ width: `${Math.round(((x.damage ?? 0) / maxDamage) * 100)}%` }} />
          </span>
        </span>
        <span className="block whitespace-nowrap text-[11px] tabular-nums text-fg-subtle">
          {fmtNum(x.csPerMin)} CS/min · {fmtInt(x.vision)} vision
        </span>
      </span>
      <span className="max-sm:col-span-2">
        <ItemRow items={x.items} size={20} />
      </span>
    </li>
  );
}

/** Adds this Ranked Solo/Duo game to Solo Queue Blocks through the journal's own import (never twice). */
function JournalButton({ matchId, inJournal }: { matchId: string; inJournal: boolean }) {
  const router = useRouter();
  const [done, setDone] = React.useState(inJournal);
  const [busy, setBusy] = React.useState(false);
  const [needsSize, setNeedsSize] = React.useState(false);
  const [size, setSize] = React.useState("");
  if (done)
    return (
      <p className="inline-flex items-center gap-1.5 rounded-lg bg-good/10 px-3 py-2 text-sm text-good" data-testid="journal-added">
        <Check className="h-4 w-4" aria-hidden /> In your Solo Queue Blocks
      </p>
    );
  const add = async () => {
    setBusy(true);
    const n = Number(size);
    const r = await importRankedMatchAction(matchId, needsSize && n ? { plannedGames: n } : {});
    setBusy(false);
    if (!r.ok) {
      if (/how many games/i.test(r.error)) return setNeedsSize(true);
      if (/already in your journal/i.test(r.error)) return setDone(true);
      return void toast.error("Not added", { description: r.error });
    }
    setDone(true);
    toast.success(`Added to ${r.data.block.label}.`, { description: "Add the main mistake and a note in Solo Queue Blocks." });
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-end gap-2" data-testid="journal-add">
      {needsSize ? (
        <div>
          <span className="mb-1 block text-xs text-fg-muted">No block in progress: how many games for the new one?</span>
          <BlockSizeInput id="match-block-size" value={size} onChange={setSize} />
        </div>
      ) : null}
      <Button variant="outline" disabled={busy || (needsSize && !(Number(size) >= 1 && Number(size) <= 20))} onClick={() => void add()} data-testid="journal-add-button">
        <NotebookPen className="h-4 w-4" /> {busy ? "Adding…" : "Add to Solo Queue Block"}
      </Button>
    </div>
  );
}
