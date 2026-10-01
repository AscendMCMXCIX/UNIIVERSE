"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { customFormat, DraftFormatError, type DraftFormat } from "@/domain/draft";
import { deleteCustomFormatAction, saveCustomFormatAction } from "@/server/actions/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";

function describe(f: DraftFormat): string {
  return f.phases.map((p) => `${p.type === "ban" ? "bans" : "picks"} ${p.simultaneous ? `${p.simultaneous.perSide} each, hidden` : p.order}`).join(" · ");
}

/**
 * Draft formats: the built-in ones are read-only; custom ones are defined by pick/ban order
 * strings (B = blue, R = red) or a simultaneous ban count, validated before saving.
 */
export function FormatsPanel({ builtin, custom, isOwner }: { builtin: DraftFormat[]; custom: DraftFormat[]; isOwner: boolean }) {
  const router = useRouter();
  const [form, setForm] = React.useState({ id: "", name: "", description: "", simultaneousBans: "", ban1: "BRBRBR", pick1: "BRRBBR", ban2: "RBRB", pick2: "RBBR" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const spec = () => ({
    id: form.id.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    name: form.name.trim(),
    description: form.description.trim(),
    ban1: form.simultaneousBans.trim() ? Number(form.simultaneousBans) : form.ban1.trim() || undefined,
    pick1: form.pick1.trim(),
    ban2: form.ban2.trim() || undefined,
    pick2: form.pick2.trim() || undefined,
  });
  let preview: DraftFormat | null = null;
  let previewError: string | null = null;
  try {
    const s = spec();
    if (s.id && s.name && s.pick1) preview = customFormat(s);
  } catch (err) {
    previewError = err instanceof DraftFormatError ? err.message : (err as Error).message;
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await saveCustomFormatAction(spec());
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setForm({ ...form, id: "", name: "", description: "" });
      router.refresh();
    }
  };
  const remove = async (id: string) => {
    if (!confirm(`Delete format "${id}"? Existing drafts keep their copy.`)) return;
    const r = await deleteCustomFormatAction(id);
    if (!r.ok) setError(r.error);
    else router.refresh();
  };

  return (
    <Panel>
      <PanelHeader title="DRAFT FORMATS" subtitle="Built-in formats cover tournament draft and Ranked Flex. Add a custom one for scrim rules, Fearless series or house formats." />
      <PanelBody className="space-y-3 text-sm">
        <div>
          <SectionLabel className="mb-1">Built-in</SectionLabel>
          {builtin.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 py-0.5 text-xs">
              <Badge tone="neutral">{f.id}</Badge>
              <span className="font-medium">{f.name}</span>
              <span className="text-fg-subtle">{describe(f)}</span>
            </div>
          ))}
        </div>
        <div>
          <SectionLabel className="mb-1">Custom</SectionLabel>
          {custom.length === 0 ? <p className="text-xs text-fg-muted">No custom formats yet.</p> : null}
          {custom.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 py-0.5 text-xs">
              <Badge tone="accent">{f.id}</Badge>
              <span className="font-medium">{f.name}</span>
              <span className="text-fg-subtle">{describe(f)}</span>
              {isOwner ? (
                <Button size="sm" variant="ghost" onClick={() => remove(f.id)}>
                  delete
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        {isOwner ? (
          <div className="space-y-2 rounded-md border border-border p-3">
            <SectionLabel>New custom format</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="id (e.g. scrim-fast)" />
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" />
            </div>
            <div className="grid gap-2 sm:grid-cols-5 text-xs">
              <label className="space-y-0.5">
                <span className="text-fg-subtle">Hidden bans per side</span>
                <Input value={form.simultaneousBans} onChange={(e) => setForm({ ...form, simultaneousBans: e.target.value })} placeholder="e.g. 5 (Ranked Flex)" />
              </label>
              <label className="space-y-0.5">
                <span className="text-fg-subtle">Ban phase 1 order</span>
                <Input value={form.ban1} onChange={(e) => setForm({ ...form, ban1: e.target.value })} placeholder="BRBRBR" disabled={!!form.simultaneousBans.trim()} className="font-mono" />
              </label>
              <label className="space-y-0.5">
                <span className="text-fg-subtle">Pick phase 1 order</span>
                <Input value={form.pick1} onChange={(e) => setForm({ ...form, pick1: e.target.value })} placeholder="BRRBBR" className="font-mono" />
              </label>
              <label className="space-y-0.5">
                <span className="text-fg-subtle">Ban phase 2 order</span>
                <Input value={form.ban2} onChange={(e) => setForm({ ...form, ban2: e.target.value })} placeholder="RBRB (optional)" className="font-mono" />
              </label>
              <label className="space-y-0.5">
                <span className="text-fg-subtle">Pick phase 2 order</span>
                <Input value={form.pick2} onChange={(e) => setForm({ ...form, pick2: e.target.value })} placeholder="RBBR (optional)" className="font-mono" />
              </label>
            </div>
            <p className="text-[11px] text-fg-subtle">B = blue acts, R = red acts, left to right. Picks must total five per side.</p>
            {preview ? <p className="text-xs text-good">Preview: {describe(preview)} ({preview.phases.reduce((s, p) => s + (p.simultaneous ? p.simultaneous.perSide * 2 : p.order?.length ?? 0), 0)} steps)</p> : null}
            {previewError ? <p className="text-xs text-warn">{previewError}</p> : null}
            {error ? <p className="text-xs text-bad">{error}</p> : null}
            <Button variant="primary" size="sm" onClick={save} disabled={busy || !preview}>
              Save format
            </Button>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
