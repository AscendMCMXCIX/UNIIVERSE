"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { PermissionPreset } from "@/server/repositories/permissions";
import { deletePermissionPresetAction, savePermissionPresetAction } from "@/server/actions/users";
import { CAPABILITIES } from "@/server/auth/permissions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { CapabilityChecklist } from "./capability-checklist";

const LABEL = Object.fromEntries(CAPABILITIES.map((c) => [c.key, c.label]));

/** Short summary of what a set allows, for rows and preset cards. */
export function describeCapabilities(caps: readonly string[]): string {
  if (caps.length === 0) return "No access";
  if (caps.length === CAPABILITIES.length) return "Every delegable capability";
  return `${caps.length} of ${CAPABILITIES.length}: ${caps.slice(0, 3).map((c) => LABEL[c] ?? c).join(", ")}${caps.length > 3 ? "…" : ""}`;
}

/** Access levels: what each preset level allows, editable; an owner may add their own levels. */
export function PermissionPresetsPanel({ presets }: { presets: PermissionPreset[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ id: string | null; name: string; description: string; capabilities: string[] } | null>(null);
  const [deleting, setDeleting] = React.useState<PermissionPreset | null>(null);
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const r = await savePermissionPresetAction(editing);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`“${editing.name}” saved.`);
    setEditing(null);
    router.refresh();
  };
  return (
    <section className="space-y-3" data-testid="permission-presets">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Base access levels</h2>
          <p className="text-sm text-fg-muted">Every account has one base level (Owner always has everything). Editing a level changes it for everyone on it.</p>
        </div>
        <Button variant="outline" onClick={() => setEditing({ id: null, name: "", description: "", capabilities: presets.find((p) => p.isDefault)?.capabilities ?? [] })}>
          <Plus className="h-4 w-4" /> New level
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {presets.map((p) => (
          <article key={p.id} className="rounded-lg border border-border bg-surface p-4" data-testid="preset-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 font-medium">
                  {p.name}
                  {p.isDefault ? <Badge tone="accent">Default</Badge> : null}
                </h3>
                {p.description ? <p className="mt-0.5 text-sm text-fg-muted">{p.description}</p> : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing({ id: p.id, name: p.name, description: p.description, capabilities: p.capabilities })}>
                  <Pencil className="h-4 w-4" />
                </Button>
                {!p.isDefault && !p.levelKey ? (
                  <Button variant="ghost" size="sm" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="mt-2 text-xs text-fg-subtle">
              {describeCapabilities(p.capabilities)} · {p.userCount} account{p.userCount === 1 ? "" : "s"}
            </p>
          </article>
        ))}
      </div>
      {editing ? (
        <Dialog
          open
          onClose={() => setEditing(null)}
          title={editing.id ? `Edit “${editing.name || "level"}”` : "New access level"}
          className="sm:max-w-3xl"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} disabled={busy || editing.name.trim().length < 2} data-testid="save-preset">
                {busy ? "Saving…" : "Save level"}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="preset-name">Name</Label>
                <Input id="preset-name" value={editing.name} maxLength={40} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="preset-description">Description (optional)</Label>
                <Input id="preset-description" value={editing.description} maxLength={200} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
            </div>
            <CapabilityChecklist value={editing.capabilities} onChange={(capabilities) => setEditing({ ...editing, capabilities })} idPrefix="preset" />
          </div>
        </Dialog>
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={`Its ${deleting?.userCount ?? 0} account(s) move to Standard Player. This cannot be undone.`}
        confirmLabel="Delete level"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          setBusy(true);
          const r = await deletePermissionPresetAction(deleting.id);
          setBusy(false);
          setDeleting(null);
          if (!r.ok) return toast.error(r.error);
          toast.success("Access level deleted.");
          router.refresh();
        }}
      />
    </section>
  );
}
