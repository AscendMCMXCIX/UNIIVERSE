"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import { dismissLinkSuggestionAction, linkRiotMatchAction } from "@/server/actions/matches";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";

export interface LinkSuggestionView {
  matchId: string;
  when: string;
  queue: string;
  result: "Win" | "Loss" | null;
  minutes: number | null;
  strength: "strong" | "possible";
  reasons: string[];
  played: Array<{ name: string; champion: PortraitChampion }>;
}

/**
 * Riot games from the lineup's stored histories that could be this drafted match. A person links
 * one (the same link as typing its match id) or says it is not this game; nothing links itself.
 */
export function LinkSuggestions({ matchRecordId, suggestions }: { matchRecordId: string; suggestions: LinkSuggestionView[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  if (suggestions.length === 0) return null;

  const link = async (riotMatchId: string) => {
    setBusy(riotMatchId);
    const r = await linkRiotMatchAction(matchRecordId, riotMatchId);
    setBusy(null);
    if (!r.ok) return toast.error("Not linked", { description: r.error });
    toast.success("Riot match linked.", r.message ? { description: r.message } : undefined);
    router.refresh();
  };
  const dismiss = async (riotMatchId: string) => {
    setBusy(riotMatchId);
    const r = await dismissLinkSuggestionAction(matchRecordId, riotMatchId);
    setBusy(null);
    if (!r.ok) return toast.error("Not saved", { description: r.error });
    router.refresh();
  };

  return (
    <Panel data-testid="link-suggestions">
      <PanelHeader
        title="Is this the Riot game?"
        subtitle="From the lineup's stored match histories"
        actions={<InfoTip label="How games are suggested" text="Games of two or more lineup players within six hours of the draft, compared on players, champions, roles, side and queue. Nothing is linked until you choose. Custom games (scrims, tournament codes) are not in the stored histories: link those by their match ID below." />}
      />
      <PanelBody className="space-y-3">
        {suggestions.map((s) => (
          <div key={s.matchId} className="rounded-panel border border-border p-3" data-testid="link-suggestion" data-match-id={s.matchId} data-strength={s.strength}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={s.strength === "strong" ? "good" : "neutral"}>{s.strength === "strong" ? "Likely match" : "Possible match"}</Badge>
              <span className="font-medium text-fg">{s.queue}</span>
              <span className="text-fg-muted">{s.when}</span>
              {s.result ? <span className={s.result === "Win" ? "text-good" : "text-bad"}>{s.result}</span> : null}
              {s.minutes ? <span className="text-fg-subtle">{s.minutes} min</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Lineup players in that game">
              {s.played.map((p) => (
                <span key={p.name} className="inline-flex items-center gap-1.5 rounded-md bg-surface-2/60 py-0.5 pl-0.5 pr-2 text-xs">
                  <ChampionPortrait champion={p.champion} size="xs" />
                  <span className="text-fg-muted">{p.name}</span>
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-fg-muted" data-testid="link-suggestion-reasons">
              {s.reasons.join(" · ")}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => void link(s.matchId)} data-testid="link-suggestion-confirm">
                <Link2 className="h-3.5 w-3.5" aria-hidden /> Link this game
              </Button>
              <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void dismiss(s.matchId)} data-testid="link-suggestion-dismiss">
                Not this game
              </Button>
            </div>
          </div>
        ))}
      </PanelBody>
    </Panel>
  );
}
