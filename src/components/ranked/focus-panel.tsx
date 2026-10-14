"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { saveRankedFocusAction } from "@/server/actions/ranked";
import type { RankedProfileView } from "@/server/ranked/repository";
import { ChampionSlot } from "@/components/champion-slot";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Info } from "@/components/ui/metric";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { metricTooltip } from "@/domain/metrics";
import type { JournalLookups } from "./types";

const SLOTS = [
  { key: "champion1", label: "Champion 1" },
  { key: "champion2", label: "Champion 2" },
  { key: "champion3", label: "Champion 3" },
  { key: "counterPick", label: "Counter pick" },
] as const;

/** Ranked focus: the three champions you are committing to, a counter pick, and one sentence. */
export function FocusPanel({ profile, lookups }: { profile: RankedProfileView; lookups: JournalLookups }) {
  const router = useRouter();
  const [draft, setDraft] = React.useState(profile);
  const [busy, setBusy] = React.useState(false);
  const championsById = React.useMemo(() => new Map(Object.entries(lookups.championsById)), [lookups.championsById]);
  const dirty = SLOTS.some((s) => draft[s.key] !== profile[s.key]) || draft.focus !== profile.focus;
  const chosen = new Set(SLOTS.map((s) => draft[s.key]).filter((id): id is string => !!id));

  const save = async () => {
    setBusy(true);
    const res = await saveRankedFocusAction({ champion1: draft.champion1, champion2: draft.champion2, champion3: draft.champion3, counterPick: draft.counterPick, focus: draft.focus });
    setBusy(false);
    if (!res.ok) return void toast.error("Focus not saved", { description: res.error });
    toast.success("Focus saved.");
    router.refresh();
  };

  return (
    <Panel>
      <PanelHeader title="Ranked focus" subtitle="The champions you are committing to this season and the one thing you are working on. Private to you." actions={dirty ? <Button size="sm" variant="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button> : null} />
      <PanelBody className="space-y-3">
        <div className="flex flex-wrap gap-4">
          {SLOTS.map((s) => (
            <div key={s.key} className="flex flex-col items-center gap-1">
              <ChampionSlot championId={draft[s.key]} champions={lookups.champions} championsById={championsById} disabledIds={new Set([...chosen].filter((id) => id !== draft[s.key]))} onChange={(id) => setDraft({ ...draft, [s.key]: id })} label={`Choose ${s.label.toLowerCase()}`} />
              <span className="text-xs text-fg-muted">{s.label}</span>
            </div>
          ))}
        </div>
        <div>
          <Label htmlFor="ranked-focus">
            <span className="inline-flex items-center gap-1">
              Current improvement focus <Info text={metricTooltip("journal-focus")} />
            </span>
          </Label>
          <Input id="ranked-focus" value={draft.focus} onChange={(e) => setDraft({ ...draft, focus: e.target.value })} maxLength={200} placeholder="One sentence, e.g. “Track the enemy jungler before every trade.”" onKeyDown={(e) => { if (e.key === "Enter" && dirty) { e.preventDefault(); void save(); } }} />
        </div>
      </PanelBody>
    </Panel>
  );
}
