"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Shield } from "lucide-react";
import { setDraftSideAction } from "@/server/actions/drafts";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { DraftStepper } from "./draft-stepper";

type Side = "blue" | "red";

/** What each side means under the draft's rules, in one line each. */
export function sideExplanation(formatId: string, side: Side): string {
  if (formatId === "ranked-flex") return side === "blue" ? "Bans are simultaneous. You make the first pick; the enemy answers with two." : "Bans are simultaneous. You answer their first pick with two and lock the last pick.";
  return side === "blue" ? "You ban first and take the first pick; the enemy has the last pick (counter-pick)." : "The enemy bans and picks first; you take picks 2 and 3 and the last pick (counter-pick).";
}

/**
 * The last step before pick/ban: which side are we on? Often only known in champion select, so
 * it is asked here rather than at setup. The controller picks Blue or Red and begins; everyone
 * else waits and the page updates by itself. The side can still be switched until the first ban
 * or pick (from the room's header); after that it is part of the draft.
 */
export function SideGate({ draftId, formatId, title, subtitle, canEdit, controllerLabel, scoutHref, scouted }: { draftId: string; formatId: string; title: string; subtitle: string; canEdit: boolean; controllerLabel: string | null; scoutHref: string | null; scouted: { ready: number; entered: number } }) {
  const router = useRouter();
  const [side, setSide] = React.useState<Side | null>(null);
  const [busy, setBusy] = React.useState(false);
  const begin = async () => {
    if (!side) return;
    setBusy(true);
    const r = await setDraftSideAction(draftId, side);
    if (!r.ok) {
      setBusy(false);
      toast.error(r.error);
      return;
    }
    router.refresh();
  };
  return (
    <div className="mx-auto max-w-3xl space-y-5" data-testid="side-gate">
      <DraftStepper current={3} />
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Ready to draft</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>
        {canEdit ? (
          <>
            <h2 className="mt-6 text-sm font-semibold text-fg" id="side-choice">
              Choose your side
            </h2>
            <div role="radiogroup" aria-labelledby="side-choice" className="mt-2 grid gap-3 sm:grid-cols-2">
              {(["blue", "red"] as const).map((s) => {
                const active = side === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSide(s)}
                    className={cn(
                      "relative flex min-h-28 flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition-[border-color,background-color,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      s === "blue" ? (active ? "border-blue bg-blue/25 shadow-lg shadow-blue/20" : "border-blue/30 bg-blue/5 hover:border-blue/60") : active ? "border-red bg-red/25 shadow-lg shadow-red/20" : "border-red/30 bg-red/5 hover:border-red/60",
                      side && !active && "opacity-60 hover:opacity-100",
                    )}
                    data-testid={`side-${s}`}
                  >
                    <span className={cn("flex items-center gap-2 text-lg font-bold uppercase tracking-[0.14em]", s === "blue" ? "text-blue" : "text-red")}>
                      <Shield className="h-5 w-5" aria-hidden /> {s} side
                    </span>
                    {active ? (
                      <span className={cn("absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full", s === "blue" ? "bg-blue text-bg" : "bg-red text-bg")} aria-hidden>
                        <Check className="h-4 w-4" />
                      </span>
                    ) : null}
                    <span className="text-sm text-fg-muted">{sideExplanation(formatId, s)}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-fg-muted">
                {scouted.entered > 0 ? `${scouted.ready} of ${scouted.entered} enemy players scouted. ` : "No enemy players entered. "}
                {scoutHref ? (
                  <Link href={scoutHref} className="text-accent hover:underline">
                    Edit enemy players
                  </Link>
                ) : null}
              </span>
              <Button variant="primary" size="lg" disabled={!side || busy} onClick={() => void begin()} className="w-full sm:w-auto" data-testid="begin-pick-ban">
                {busy ? "Starting…" : "Begin pick/ban"} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-6 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-sm text-fg-muted">Waiting for {controllerLabel ?? "the draft's controller"} to choose a side. This page updates by itself.</p>
            <AutoRefresh active intervalMs={3000} maxMs={30 * 60_000} />
          </>
        )}
      </section>
    </div>
  );
}
