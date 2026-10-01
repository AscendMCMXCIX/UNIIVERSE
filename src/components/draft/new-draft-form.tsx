"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createDraftAction } from "@/server/actions/drafts";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

export function NewDraftForm({ lineupReady }: { lineupReady: boolean }) {
  const router = useRouter();
  const [opponent, setOpponent] = React.useState("");
  const [side, setSide] = React.useState<"blue" | "red">("blue");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createDraftAction({ opponentName: opponent, side });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/draft/${res.data.id}`);
  };

  return (
    <Panel>
      <PanelHeader title="NEW DRAFT" subtitle="Tournament draft with the current active lineup." />
      <PanelBody>
        <form onSubmit={start} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="opponent">Opponent</Label>
            <Input id="opponent" value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Team name (optional)" maxLength={60} />
          </div>
          <div>
            <Label>Our side</Label>
            <div className="flex gap-1.5">
              {(["blue", "red"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={cn(
                    "h-9 rounded-md border px-4 text-sm font-medium capitalize",
                    side === s ? (s === "blue" ? "border-blue bg-blue/15 text-blue" : "border-red bg-red/15 text-red") : "border-border bg-bg-elevated text-fg-muted hover:text-fg",
                  )}
                >
                  {s} side
                </button>
              ))}
            </div>
          </div>
          <Button type="submit" variant="primary" size="lg" disabled={busy || !lineupReady}>
            {busy ? "Starting…" : "Start draft"}
          </Button>
        </form>
        {!lineupReady ? <p className="mt-2 text-xs text-warn">Assign all five roles on the Team page first.</p> : null}
        {error ? <p className="mt-2 text-xs text-bad">{error}</p> : null}
      </PanelBody>
    </Panel>
  );
}
