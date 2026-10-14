"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { CARD_ACCENTS, championCardArtUrl, type CardAccent } from "@/domain/player-card";
import { setCardStyleAction } from "@/server/actions/players";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const SWATCH: Record<CardAccent, { color: string; label: string }> = {
  default: { color: "var(--color-accent)", label: "UNIIVERSE cyan" },
  gold: { color: "#e8b04a", label: "Gold" },
  teal: { color: "#2dd4bf", label: "Teal" },
  violet: { color: "#a78bfa", label: "Violet" },
  rose: { color: "#fb7185", label: "Rose" },
};

/**
 * The player's Team card, kept simple: which pool champion's art is shown, and an accent colour.
 * Saves on each choice; the preview mirrors the card's art and gradient.
 */
export function CardStyleEditor({ playerId, champions, featured, accent }: { playerId: string; champions: PortraitChampion[]; featured: string | null; accent: CardAccent }) {
  const router = useRouter();
  const [state, setState] = React.useState({ featured, accent });
  const [busy, setBusy] = React.useState(false);
  const save = async (next: { featured: string | null; accent: CardAccent }) => {
    const before = state;
    setState(next);
    setBusy(true);
    const r = await setCardStyleAction(playerId, { featuredChampionId: next.featured, cardAccent: next.accent });
    setBusy(false);
    if (!r.ok) {
      setState(before);
      return toast.error(r.error);
    }
    router.refresh();
  };
  const color = SWATCH[state.accent].color;
  return (
    <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]" data-testid="card-style">
      <div className="relative h-36 overflow-hidden rounded-xl border border-border bg-surface" aria-hidden>
        {state.featured ? <div className="absolute inset-0 bg-cover bg-[center_18%] opacity-70" style={{ backgroundImage: `url(${championCardArtUrl(state.featured)})` }} /> : null}
        <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/45 to-surface" />
        <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 0% 0%, color-mix(in srgb, ${color} 22%, transparent), transparent 60%)` }} />
        <span className="absolute bottom-2 left-2 h-1.5 w-10 rounded-full" style={{ background: color }} />
      </div>
      <div className="space-y-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-fg-muted">Featured champion</div>
          {champions.length === 0 ? (
            <p className="text-sm text-fg-subtle">Add champions to a pool to choose one.</p>
          ) : (
            <div role="radiogroup" aria-label="Featured champion" className="flex flex-wrap gap-1.5">
              {champions.slice(0, 40).map((c) => {
                const on = (state.featured ?? champions[0]?.id) === c.id;
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={on} aria-label={c.name} title={c.name} disabled={busy} onClick={() => save({ ...state, featured: c.id })} className={cn("rounded-md p-0.5 transition-shadow", on ? "ring-2 ring-accent" : "hover:ring-1 hover:ring-border-strong")}>
                    <ChampionPortrait champion={c} size="sm" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-fg-muted">Accent</div>
          <div role="radiogroup" aria-label="Card accent" className="flex flex-wrap gap-2">
            {CARD_ACCENTS.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={state.accent === a} aria-label={SWATCH[a].label} title={SWATCH[a].label} disabled={busy} onClick={() => save({ ...state, accent: a })} className={cn("grid h-9 w-9 place-items-center rounded-full border-2 transition-transform motion-safe:hover:scale-105", state.accent === a ? "border-fg" : "border-transparent")} style={{ background: SWATCH[a].color }}>
                {state.accent === a ? <Check className="h-4 w-4 text-bg" aria-hidden /> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
