"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { ROLES } from "@/domain/roles";
import type { EnemyScoutingView } from "@/server/scouting/session";
import { getEnemyScoutingAction, setEnemyPlayerAction } from "@/server/actions/drafts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

/** Ranked games behind a scouted player before their picks count as more than a hint. */
export const READY_GAMES = 5;

type RowState = { phase: "idle" } | { phase: "checking" } | { phase: "invalid"; message: string } | { phase: "error"; message: string };

export interface EnemyStatus {
  tone: "neutral" | "busy" | "good" | "warn" | "bad";
  label: string;
  detail?: string;
}

/** The plain-language status of one enemy entry (identity first, then the scouting behind it). */
export function enemyStatus(value: string, row: EnemyScoutingView | undefined, local: RowState): EnemyStatus | null {
  if (local.phase === "checking") return { tone: "busy", label: "Checking account" };
  if (local.phase === "invalid") return { tone: "warn", label: local.message };
  if (local.phase === "error") return { tone: "bad", label: "Could not save", detail: local.message };
  if (!value.trim()) return null;
  if (!row) return { tone: "neutral", label: "Not checked yet" };
  switch (row.status) {
    case "verified":
      return { tone: "busy", label: "Verified · gathering recent games" };
    case "ok":
      return row.gamesAnalysed >= READY_GAMES
        ? { tone: "good", label: `Scouting ready · ${row.gamesAnalysed} ranked games`, detail: [row.rank, row.likelyRole ? `likely ${row.likelyRole.toLowerCase()}` : null].filter(Boolean).join(" · ") || undefined }
        : { tone: "warn", label: `Limited data available · ${row.gamesAnalysed} ranked game${row.gamesAnalysed === 1 ? "" : "s"}`, detail: row.rank ?? undefined };
    case "pending":
      return { tone: "warn", label: "Gathering additional data", detail: row.error ?? "Riot did not answer in time; the draft uses global evidence meanwhile." };
    case "unresolved":
      return { tone: "bad", label: "Unable to verify", detail: row.error ?? "Riot does not know this Riot ID." };
    default:
      return { tone: "bad", label: "Unable to verify", detail: row.error ?? undefined };
  }
}

const TONE: Record<EnemyStatus["tone"], string> = { neutral: "text-fg-subtle", busy: "text-accent", good: "text-good", warn: "text-warn", bad: "text-bad" };

function StatusLine({ status }: { status: EnemyStatus }) {
  const Icon = status.tone === "busy" ? Loader2 : status.tone === "good" ? CheckCircle2 : status.tone === "bad" ? XCircle : status.tone === "warn" ? AlertTriangle : null;
  return (
    <span className={cn("flex min-w-0 items-start gap-1.5 text-xs", TONE[status.tone])} role="status">
      {Icon ? <Icon className={cn("mt-px h-3.5 w-3.5 shrink-0", status.tone === "busy" && "animate-spin motion-reduce:animate-none")} aria-hidden /> : null}
      <span className="min-w-0">
        <span className="font-medium">{status.label}</span>
        {status.detail ? <span className="block text-fg-subtle">{status.detail}</span> : null}
      </span>
    </span>
  );
}

/**
 * Opponent scouting, the second step of a draft: five optional Riot ID fields shown at once, in
 * any order, no roles to assign. Each entry is verified with Riot as soon as it is entered, then
 * its recent ranked games are collected in the background (cached scouting is used at once).
 * Nothing here blocks the draft: continue with any, some or none of the enemies scouted; the
 * draft room picks up evidence that arrives later.
 */
export function EnemyScoutPanel({ draftId, initialValues, initialScouting, prepareHref }: { draftId: string; initialValues: string[]; initialScouting: EnemyScoutingView[]; prepareHref: string | null }) {
  const router = useRouter();
  const [values, setValues] = React.useState<string[]>(() => ROLES.map((_, i) => initialValues[i] ?? ""));
  const saved = React.useRef<string[]>(ROLES.map((_, i) => initialValues[i] ?? ""));
  const [scouting, setScouting] = React.useState(initialScouting);
  const [local, setLocal] = React.useState<RowState[]>(() => ROLES.map(() => ({ phase: "idle" })));
  const rowFor = (i: number) => scouting.find((r) => r.role === ROLES[i]);

  const commit = async (i: number) => {
    const value = values[i]!.trim();
    if (value === saved.current[i]) return;
    if (value && !/^[^#]{1,16}#[^#\s]{2,5}$/u.test(value)) {
      setLocal((l) => l.map((x, j) => (j === i ? { phase: "invalid", message: "Use the full Riot ID, for example Name#OCE" } : x)));
      return;
    }
    setLocal((l) => l.map((x, j) => (j === i ? { phase: "checking" } : x)));
    const r = await setEnemyPlayerAction(draftId, i, value);
    if (!r.ok) {
      setLocal((l) => l.map((x, j) => (j === i ? { phase: "error", message: r.error } : x)));
      return;
    }
    saved.current[i] = value;
    setScouting(r.data.scouting);
    setLocal((l) => l.map((x, j) => (j === i ? (r.data.check.status === "invalid" ? { phase: "invalid", message: r.data.check.error } : { phase: "idle" }) : x)));
  };

  // While evidence is still arriving, ask again every few seconds (bounded).
  const waiting = scouting.some((r) => r.status === "verified");
  React.useEffect(() => {
    if (!waiting) return;
    let rounds = 0;
    const id = window.setInterval(async () => {
      rounds += 1;
      setScouting(await getEnemyScoutingAction(draftId));
      if (rounds >= 40) window.clearInterval(id);
    }, 2500);
    return () => window.clearInterval(id);
  }, [waiting, draftId]);

  const checking = local.some((l) => l.phase === "checking");
  const entered = values.filter((v) => v.trim()).length;
  const ready = scouting.filter((r) => r.status === "ok").length;

  return (
    <div className="space-y-5">
      <ol className="grid gap-2.5" data-testid="enemy-fields">
        {values.map((value, i) => {
          const status = enemyStatus(value, rowFor(i), local[i]!);
          return (
            <li key={i} className="grid items-start gap-2 rounded-panel border border-border bg-bg-elevated/60 p-3 sm:grid-cols-[2rem_minmax(0,18rem)_minmax(0,1fr)] sm:items-center">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-red/15 text-sm font-semibold text-red max-sm:hidden" aria-hidden>
                {i + 1}
              </span>
              <Input
                aria-label={`Enemy player ${i + 1} Riot ID`}
                value={value}
                placeholder="Name#TAG"
                autoComplete="off"
                spellCheck={false}
                maxLength={40}
                onChange={(e) => {
                  const next = e.target.value;
                  setValues((v) => v.map((x, j) => (j === i ? next : x)));
                  if (local[i]!.phase === "invalid" || local[i]!.phase === "error") setLocal((l) => l.map((x, j) => (j === i ? { phase: "idle" } : x)));
                }}
                onBlur={() => void commit(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commit(i);
                  }
                }}
                data-testid={`enemy-input-${i}`}
              />
              <div className="min-h-5" data-testid={`enemy-status-${i}`}>
                {status ? <StatusLine status={status} /> : null}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-fg-muted">
        {entered === 0
          ? "No enemy players entered: recommendations use global ranked and professional evidence only."
          : `${ready} of ${entered} enemy player${entered === 1 ? "" : "s"} scouted.${waiting || checking ? " Scouting keeps updating in the background; recommendations refresh when it arrives." : ""}`}
      </p>
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        {prepareHref ? (
          <Link href={prepareHref} className="text-sm text-accent hover:underline">
            Open the pre-draft plan
          </Link>
        ) : (
          <span />
        )}
        <Button
          variant="primary"
          size="lg"
          disabled={checking}
          onClick={() => router.push(`/draft/${draftId}`)}
          className="w-full sm:w-auto"
          data-testid="continue-to-draft"
        >
          Continue to pick/ban <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {ready > 0 ? `${ready} enemy players scouted` : ""}
      </p>
    </div>
  );
}
