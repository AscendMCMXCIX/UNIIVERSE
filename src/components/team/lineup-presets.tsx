"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bookmark, History } from "lucide-react";
import { ROLES, type Role } from "@/domain/roles";
import { applyLineupPresetAction, deleteLineupPresetAction, saveLineupPresetAction } from "@/server/actions/players";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";

export interface PresetView {
  id: string;
  name: string;
  slots: Partial<Record<Role, string>>;
  lastUsedAt: string | null;
}

/** Saved lineups (named presets) and recently used lineups, one click to apply. */
export function LineupPresets({ saved, recent, playerNames, canEdit, currentComplete }: { saved: PresetView[]; recent: PresetView[]; playerNames: Record<string, string>; canEdit: boolean; currentComplete: boolean }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Failed");
    else router.refresh();
  };
  const Row = ({ p, saved }: { p: PresetView; saved: boolean }) => (
    <div className="flex flex-wrap items-center gap-2 py-1 text-xs">
      <span className="w-40 truncate font-medium" title={p.name}>
        {p.name}
      </span>
      <span className="flex flex-wrap items-center gap-1 text-fg-muted">
        {ROLES.map((r) => (
          <span key={r} className="flex items-center gap-0.5">
            <RoleIcon role={r} className="h-3 w-3 text-fg-subtle" /> {playerNames[p.slots[r] ?? ""] ?? "—"}
          </span>
        ))}
      </span>
      {canEdit ? (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => applyLineupPresetAction(p.id))}>
            Use
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => deleteLineupPresetAction(p.id))}>
            {saved ? "delete" : "forget"}
          </Button>
        </>
      ) : null}
    </div>
  );
  return (
    <Panel>
      <PanelHeader title="SAVED & RECENT LINEUPS" subtitle="Switch the active five in one click. Recent lineups are remembered when a draft starts." />
      <PanelBody className="space-y-3">
        {canEdit ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void run(() => saveLineupPresetAction(name)).then(() => setName(""));
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Save current lineup as… (e.g. Clash main)" className="max-w-xs" disabled={!currentComplete} />
            <Button type="submit" size="sm" variant="primary" disabled={busy || !currentComplete || !name.trim()}>
              <Bookmark className="h-3.5 w-3.5" /> Save
            </Button>
            {!currentComplete ? <span className="text-xs text-fg-subtle">Fill all five roles first.</span> : null}
          </form>
        ) : null}
        {error ? <p className="text-xs text-bad">{error}</p> : null}
        <div>
          <SectionLabel className="mb-1">Saved</SectionLabel>
          {saved.length === 0 ? <p className="text-xs text-fg-muted">No saved lineups yet.</p> : saved.map((p) => <Row key={p.id} p={p} saved />)}
        </div>
        <div>
          <SectionLabel className="mb-1">
            <History className="mr-1 inline h-3 w-3" /> Recent
          </SectionLabel>
          {recent.length === 0 ? <p className="text-xs text-fg-muted">Nothing yet: lineups are remembered when a draft starts.</p> : recent.map((p) => <Row key={p.id} p={p} saved={false} />)}
        </div>
      </PanelBody>
    </Panel>
  );
}
