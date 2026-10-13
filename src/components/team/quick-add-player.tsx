"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import { createPlayerAction } from "@/server/actions/players";
import { normalise } from "@/components/champion-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

/**
 * Quick add: name, role and a comma-separated champion list resolved by fuzzy name. Full editing
 * (secondary role, notes, Riot accounts) lives on the player page.
 */
export function QuickAddPlayer({ champions }: { champions: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<Role>("MID");
  const [group, setGroup] = React.useState<"main" | "other">("other");
  const [pool, setPool] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const resolve = (text: string): { ids: string[]; unknown: string[] } => {
    const ids: string[] = [];
    const unknown: string[] = [];
    for (const raw of text.split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)) {
      const q = normalise(raw);
      const exact = champions.find((c) => normalise(c.name) === q || normalise(c.id) === q);
      const partial = exact ?? champions.filter((c) => normalise(c.name).startsWith(q))[0] ?? champions.filter((c) => normalise(c.name).includes(q))[0];
      if (partial && !ids.includes(partial.id)) ids.push(partial.id);
      else if (!partial) unknown.push(raw);
    }
    return { ids, unknown };
  };
  const preview = resolve(pool);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview.unknown.length) return setError(`Unknown champion${preview.unknown.length > 1 ? "s" : ""}: ${preview.unknown.join(", ")}`);
    setBusy(true);
    setError(null);
    const r = await createPlayerAction({ displayName: name.trim(), primaryRole: role, group, primaryPool: preview.ids });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setName("");
      setPool("");
      setOpen(false);
      router.refresh();
    }
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Quick add
      </Button>
    );
  }
  return (
    <Panel className="w-full border-accent/40">
      <PanelHeader title="QUICK ADD PLAYER" subtitle="Name, role and a few champions. Everything else can be filled in later." actions={<Button size="sm" variant="ghost" onClick={() => setOpen(false)}>close</Button>} />
      <PanelBody>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2 text-xs">
          <label className="space-y-0.5">
            <span className="text-fg-subtle">Name</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" required className="w-40" />
          </label>
          <label className="space-y-0.5">
            <span className="text-fg-subtle">Primary role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-11 rounded-md border border-border bg-bg-elevated px-2 text-base md:h-9 md:text-sm">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-0.5">
            <span className="text-fg-subtle">Group</span>
            <select value={group} onChange={(e) => setGroup(e.target.value as "main" | "other")} className="h-11 rounded-md border border-border bg-bg-elevated px-2 text-base md:h-9 md:text-sm">
              <option value="main">Main</option>
              <option value="other">Other / sub</option>
            </select>
          </label>
          <label className="w-full flex-1 space-y-0.5 sm:min-w-[260px]">
            <span className="text-fg-subtle">Champions (comma separated, fuzzy)</span>
            <Input value={pool} onChange={(e) => setPool(e.target.value)} placeholder="e.g. ori, syndra, azir" />
          </label>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            Add
          </Button>
          <div className="w-full text-fg-subtle">
            {preview.ids.length ? `Pool: ${preview.ids.map((id) => champions.find((c) => c.id === id)?.name ?? id).join(", ")}` : "No champions yet (the pool can be filled in later)."}
            {preview.unknown.length ? <span className="ml-2 text-warn">Unknown: {preview.unknown.join(", ")}</span> : null}
          </div>
          {error ? <p className="w-full text-bad">{error}</p> : null}
        </form>
      </PanelBody>
    </Panel>
  );
}
