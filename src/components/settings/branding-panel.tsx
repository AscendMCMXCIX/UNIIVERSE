"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_BRANDING, MAX_LOGO_CHARS, type Branding } from "@/domain/branding";
import { resetBrandingAction, saveBrandingAction } from "@/server/actions/branding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

/** Team name, short name, tagline, accent colour and logo. Owner only. */
export function BrandingPanel({ branding, isOwner }: { branding: Branding; isOwner: boolean }) {
  const router = useRouter();
  const [form, setForm] = React.useState<Branding>(branding);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const onLogo = (file: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type)) return setError("Use a PNG, JPEG, WebP, GIF or SVG image.");
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      if (url.length > MAX_LOGO_CHARS) setError("Logo too large: keep it under 150 KB (a 256×256 PNG is plenty).");
      else {
        setError(null);
        setForm((f) => ({ ...f, logoDataUrl: url }));
      }
    };
    reader.readAsDataURL(file);
  };

  const save = async (value: Branding | null) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const r = value ? await saveBrandingAction(value) : await resetBrandingAction();
    setBusy(false);
    if (!r.ok) setError(r.error);
    else {
      setForm(r.data);
      setMessage("Saved. The sidebar updates on the next page load.");
      router.refresh();
    }
  };

  return (
    <Panel>
      <PanelHeader title="BRANDING" subtitle="Your team's name, short name, colour and logo. The engine does not care; your players will." />
      <PanelBody className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Team name</span>
            <Input disabled={!isOwner} value={form.teamName} onChange={(e) => setForm({ ...form, teamName: e.target.value })} maxLength={60} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Short name (sidebar, draft room)</span>
            <Input disabled={!isOwner} value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value.toUpperCase() })} maxLength={14} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Tagline</span>
            <Input disabled={!isOwner} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={60} />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-fg-muted">Accent colour</span>
            <span className="flex items-center gap-2">
              <input type="color" disabled={!isOwner} value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} className="h-9 w-12 cursor-pointer rounded-md border border-border bg-bg-elevated" />
              <Input disabled={!isOwner} value={form.accent} onChange={(e) => setForm({ ...form, accent: e.target.value })} maxLength={7} className="font-mono" />
            </span>
          </label>
          <div className="space-y-1 sm:col-span-2">
            <span className="text-xs text-fg-muted">Logo (PNG/SVG/WebP, under 150 KB)</span>
            <div className="flex items-center gap-3">
              {form.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoDataUrl} alt="Team logo" className="h-12 w-12 rounded-md border border-border object-contain" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-fg-subtle">none</div>
              )}
              {isOwner ? <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(e) => onLogo(e.target.files?.[0] ?? null)} className="text-xs" /> : null}
              {isOwner && form.logoDataUrl ? (
                <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, logoDataUrl: null })}>
                  Remove logo
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-border bg-bg-elevated px-3 py-2" style={{ ["--color-accent" as string]: form.accent }}>
          {form.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logoDataUrl} alt="" className="h-8 w-8 object-contain" />
          ) : null}
          <div>
            <div className="text-[10px] tracking-[0.35em] text-fg-subtle">{form.tagline.toUpperCase() || "DRAFT PLATFORM"}</div>
            <div className="text-base font-bold tracking-[0.2em]" style={{ color: form.accent }}>
              {form.shortName || DEFAULT_BRANDING.shortName}
            </div>
          </div>
          <span className="ml-auto text-xs text-fg-subtle">preview</span>
        </div>
        {error ? <p className="text-xs text-bad">{error}</p> : null}
        {message ? <p className="text-xs text-good">{message}</p> : null}
        {isOwner ? (
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => save(form)} disabled={busy}>
              Save branding
            </Button>
            <Button variant="ghost" onClick={() => save(null)} disabled={busy}>
              Reset to defaults
            </Button>
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
