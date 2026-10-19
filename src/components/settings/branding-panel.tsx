"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImageUp, RotateCcw, Trash2, XCircle } from "lucide-react";
import { BRAND_LIMITS, BRAND_RECOMMENDED_BYTES, BRAND_UPLOAD_CHUNK_BYTES, brandThemeVars, checkContrast, DEFAULT_BACKDROP_LEVEL, DEFAULT_BRANDING, DEFAULT_COLOURS, logoSrc, logoStillSrc, backgroundSrc, appBackgroundSrc, type BrandAssetKind, type BrandColours, type Branding } from "@/domain/branding";
import { finishBrandUploadAction, removeBrandAssetAction, resetBrandingAction, saveBrandingAction } from "@/server/actions/branding";
import { BrandImage } from "@/components/brand-image";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { backdropCss } from "@/lib/backdrop";
import { cn } from "@/lib/cn";

const COLOUR_FIELDS: Array<{ key: keyof BrandColours; label: string; hint: string }> = [
  { key: "accent", label: "Primary accent", hint: "Buttons, links, the active page" },
  { key: "accent2", label: "Secondary accent", hint: "Gradients and the background glow" },
  { key: "background", label: "Background", hint: "Behind everything" },
  { key: "surface", label: "Surface", hint: "Panels and cards; shades and borders follow it" },
  { key: "highlight", label: "Highlight", hint: "Selections and the current item" },
];

/** The first frame of an animated image, drawn on a canvas (scaled down to `maxSide`). */
async function stillFrame(src: string, kind: BrandAssetKind): Promise<string | null> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const maxSide = kind === "logo" ? 512 : 1600;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return kind === "logo" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.8);
}

/** Sends a file in pieces small enough for the hosting platform's request limit; reports progress (0..1). */
async function sendInPieces(file: File, kind: BrandAssetKind, onProgress: (p: number) => void): Promise<{ uploadId: string; pieces: number }> {
  const uploadId = crypto.randomUUID();
  const pieces = Math.max(1, Math.ceil(file.size / BRAND_UPLOAD_CHUNK_BYTES));
  for (let i = 0; i < pieces; i++) {
    const body = file.slice(i * BRAND_UPLOAD_CHUNK_BYTES, Math.min(file.size, (i + 1) * BRAND_UPLOAD_CHUNK_BYTES));
    let attempt = 0;
    for (;;) {
      const res = await fetch(`/api/branding/upload?kind=${kind}&upload=${uploadId}&index=${i}`, { method: "POST", body, headers: { "content-type": "application/octet-stream" } }).catch(() => null);
      if (res?.ok) break;
      const reason = res ? ((await res.json().catch(() => null)) as { error?: string } | null)?.error : null;
      // A dropped connection is retried twice; a refusal (too large, no permission) is final.
      if ((res && res.status < 500) || attempt >= 2) throw new Error(reason ?? "The connection dropped while uploading; please try again.");
      attempt += 1;
    }
    onProgress((i + 1) / pieces);
  }
  return { uploadId, pieces };
}

function ImageCard({ kind, title, hint, branding, onChange }: { kind: BrandAssetKind; title: string; hint: string; branding: Branding; onChange: (b: Branding) => void }) {
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<number | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const limit = BRAND_LIMITS[kind];
  const meta = branding.assets[kind];
  const src = kind === "logo" ? (meta ? logoSrc(branding) : null) : kind === "appBackground" ? appBackgroundSrc(branding) : backgroundSrc(branding);
  const still = kind === "logo" ? (meta ? logoStillSrc(branding) : null) : null;
  const accept = kind === "logo" ? "image/png,image/jpeg,image/webp,image/gif,image/svg+xml" : "image/png,image/jpeg,image/webp,image/gif";

  const upload = async (file: File | null) => {
    if (!file) return;
    if (file.size > limit.maxBytes) return toast.error(`${title} too large`, { description: `Keep it under ${limit.label}.` });
    setBusy(true);
    setProgress(0);
    try {
      const mayAnimate = file.type === "image/gif" || file.type === "image/webp";
      // The still first frame is drawn from a local object URL: the big file is read only once, by the upload.
      const local = URL.createObjectURL(file);
      const stillUrl = mayAnimate ? await stillFrame(local, kind).catch(() => null) : null;
      URL.revokeObjectURL(local);
      const sent = await sendInPieces(file, kind, setProgress);
      const r = await finishBrandUploadAction(kind, sent.uploadId, sent.pieces, stillUrl);
      if (!r.ok) toast.error(`${title} not saved`, { description: r.error });
      else {
        onChange(r.data);
        toast.success(`${title} updated${r.data.assets[kind]?.animated ? " (animated)" : ""}.`, file.size > BRAND_RECOMMENDED_BYTES ? { description: `It is ${(file.size / 1_000_000).toFixed(1)} MB: everyone downloads it once on their next visit, which can take a while on a phone.` } : undefined);
      }
    } catch (err) {
      toast.error(`${title} not saved`, { description: (err as Error).message });
    } finally {
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };
  const remove = async () => {
    setBusy(true);
    const r = await removeBrandAssetAction(kind);
    setBusy(false);
    setConfirm(false);
    if (!r.ok) toast.error(r.error);
    else {
      onChange(r.data);
      toast.success(`${title} removed.`);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-panel border border-border bg-bg-elevated p-4" data-testid={`brand-${kind}`}>
      <div>
        <div className="text-sm font-semibold text-fg">{title}</div>
        <p className="text-sm text-fg-muted">{hint}</p>
      </div>
      <div className={cn("grid place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-surface", kind === "logo" ? "h-28" : "h-36")}>
        {src ? (
          <BrandImage src={src} still={still} alt={`${title} preview`} className={kind === "logo" ? "h-20 w-20 object-contain" : "h-full w-full object-cover"} />
        ) : (
          <span className="grid place-items-center gap-1 px-3 text-center" data-testid={`brand-${kind}-empty`}>
            <span className="text-sm font-medium text-fg-muted">No image selected</span>
            <span className="text-xs text-fg-subtle">{kind === "logo" ? "The team name is shown as text." : "A plain background in your colours is used."}</span>
          </span>
        )}
      </div>
      <p className="text-xs text-fg-subtle">
        {kind === "logo" ? "PNG, JPEG, WebP, GIF or SVG" : "PNG, JPEG, WebP or GIF"} · up to {limit.label} and {limit.maxSide}×{limit.maxSide} px (under 5 MB keeps the first visit quick on phones). Animated GIFs keep moving; the browser tab and people who prefer reduced motion see the first frame.
        {meta?.animated ? " This one is animated." : ""}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        <input ref={input} type="file" accept={accept} className="sr-only" onChange={(e) => void upload(e.target.files?.[0] ?? null)} aria-label={`Upload ${title.toLowerCase()}`} />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          <ImageUp className="h-4 w-4" /> {busy ? (progress !== null && progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : "Checking…") : meta ? "Replace" : "Upload"}
        </Button>
        {meta ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4" /> Remove
          </Button>
        ) : null}
      </div>
      <ConfirmDialog open={confirm} busy={busy} title={`Remove the ${title.toLowerCase()}?`} description={kind === "logo" ? "The team name is shown as text instead; no other image is put in its place." : "A plain background in your colours is used instead; no other image is put in its place."} confirmLabel="Remove" onCancel={() => setConfirm(false)} onConfirm={remove} />
    </div>
  );
}

const LEVEL_NAMES: Array<[number, string]> = [
  [0, "Faint"],
  [20, "Subtle"],
  [40, "Balanced"],
  [65, "Clearly visible"],
  [90, "Strong"],
];
const levelName = (level: number) => [...LEVEL_NAMES].reverse().find(([min]) => level >= min)![1];

/*
  Background visibility, one value for the whole team and every page. While it is being changed,
  this page's own backdrop shows the level (a <style> only this panel renders, so nobody else sees
  it); every page shows the saved level to everyone once it is saved.
*/
function BackdropSetting({ level, saved, hasArtwork, disabled, onChange }: { level: number; saved: number; hasArtwork: boolean; disabled: boolean; onChange: (level: number) => void }) {
  const id = React.useId();
  return (
    <section className="space-y-3 rounded-card border border-border bg-surface p-4 sm:p-5" data-testid="brand-backdrop-setting">
      <div>
        <h2 className="text-base font-semibold">Background visibility</h2>
        <p className="text-sm text-fg-muted">How much of the app background shows behind every page, for every member: from a hint of it at 0% to clearly visible at 100%. Cards and panels keep their own backgrounds, so text stays readable; player-card art is not affected.</p>
      </div>
      {hasArtwork ? (
        <>
          {/* Live preview on this page only (validated whole numbers, so safe to inline). */}
          <style data-testid="backdrop-preview-style">{backdropCss(level)}</style>
          <div className="max-w-md">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`${id}-level`} className="text-sm font-medium text-fg">
                Background visibility
              </label>
              <span className="text-sm tabular-nums text-fg" data-testid="backdrop-value">
                {level}%
              </span>
            </div>
            <input
              id={`${id}-level`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={level}
              disabled={disabled}
              onChange={(e) => onChange(Number(e.target.value))}
              aria-valuetext={`${level}%, ${levelName(level).toLowerCase()}`}
              className="mt-2 h-6 w-full cursor-pointer accent-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="backdrop-slider"
            />
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
              <span>
                {levelName(level)}
                {level !== saved ? <span data-testid="backdrop-saved"> · saved: {saved}%</span> : null}
              </span>
              <button type="button" onClick={() => onChange(DEFAULT_BACKDROP_LEVEL)} disabled={disabled || level === DEFAULT_BACKDROP_LEVEL} className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-fg-muted hover:text-fg disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent" data-testid="backdrop-reset">
                <RotateCcw className="h-3 w-3" aria-hidden /> Reset to default ({DEFAULT_BACKDROP_LEVEL}%)
              </button>
            </div>
          </div>
          <p className="text-xs leading-snug text-fg-subtle">This page&apos;s background previews the level as you move the slider. Nobody else sees it until you save; then everyone sees it on every page.</p>
        </>
      ) : (
        <p className="text-sm text-fg-subtle" data-testid="backdrop-no-artwork">
          Upload an app background above to choose how much of it shows.
        </p>
      )}
    </section>
  );
}

/** A miniature of the app in the chosen colours, so changes can be judged before saving. */
function Preview({ form }: { form: Branding }) {
  const vars = { "--color-accent": form.accent, ...brandThemeVars(form) } as React.CSSProperties;
  return (
    <div className="overflow-hidden rounded-panel border border-border" style={vars} data-testid="brand-preview">
      <div className="flex min-h-48 bg-bg" style={{ backgroundImage: `radial-gradient(ellipse 80% 60% at 50% 120%, color-mix(in srgb, ${form.accent2 ?? DEFAULT_COLOURS.accent2} 25%, transparent), transparent 70%)` }}>
        <div className="hidden w-40 shrink-0 flex-col gap-1 border-r border-border bg-bg-elevated p-3 sm:flex">
          <div className="mb-2 flex items-center gap-2">
            <BrandMark src={logoSrc(form)} still={logoStillSrc(form)} name={form.shortName || DEFAULT_BRANDING.shortName} className="h-7 w-7 rounded-md text-xs" />
            <span className="truncate text-xs font-bold tracking-[0.12em] text-fg">{form.shortName || DEFAULT_BRANDING.shortName}</span>
          </div>
          <span className="rounded-md bg-accent/15 px-2 py-1.5 text-xs font-medium text-accent">Team</span>
          <span className="px-2 py-1.5 text-xs text-fg-muted">Players</span>
          <span className="px-2 py-1.5 text-xs text-fg-muted">Matches</span>
        </div>
        <div className="flex-1 space-y-2 p-3">
          <div className="rounded-lg border border-border bg-surface p-3">
            <div className="text-sm font-semibold text-fg">{form.teamName || DEFAULT_BRANDING.teamName}</div>
            {form.tagline ? <div className="text-xs text-fg-subtle">{form.tagline}</div> : null}
            <p className="mt-1 text-xs text-fg-muted">Panels, text and borders look like this.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-bg">Primary button</span>
              <span className="text-xs text-accent underline">A link</span>
              <span className="rounded-md border border-highlight px-2 py-0.5 text-xs text-highlight">Highlight</span>
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-2 text-xs text-fg-muted">A nested card</div>
        </div>
      </div>
    </div>
  );
}

/** Admin → Branding: names, images and colours, with a live preview. */
export function BrandingPanel({ branding, isOwner }: { branding: Branding; isOwner: boolean }) {
  const router = useRouter();
  const [form, setForm] = React.useState<Branding>(branding);
  const [saved, setSaved] = React.useState<Branding>(branding);
  const [busy, setBusy] = React.useState(false);
  const checks = checkContrast(form);
  const unreadable = checks.filter((c) => !c.ok);
  const dirty = JSON.stringify({ ...form, assets: null }) !== JSON.stringify({ ...saved, assets: null });

  const save = async (reset = false) => {
    setBusy(true);
    const r = reset ? await resetBrandingAction() : await saveBrandingAction(form);
    setBusy(false);
    if (!r.ok) return toast.error("Branding not saved", { description: r.error });
    setForm(r.data);
    setSaved(r.data);
    toast.success(reset ? "Colours and background visibility reset; names kept." : "Branding saved.");
    router.refresh();
  };
  const onAssets = (b: Branding) => {
    setForm((f) => ({ ...f, assets: b.assets }));
    setSaved((s) => ({ ...s, assets: b.assets }));
    router.refresh();
  };
  const setColour = (key: keyof BrandColours, value: string | null) => setForm((f) => ({ ...f, [key]: key === "accent" ? (value ?? DEFAULT_COLOURS.accent) : value }));

  return (
    <div className="space-y-6" data-testid="branding-panel">
      <section className="space-y-3 rounded-card border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-base font-semibold">Name</h2>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label htmlFor="brand-product">App name</Label>
            <Input id="brand-product" disabled={!isOwner} value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} maxLength={40} data-testid="brand-product" />
            <p className="mt-1 text-xs text-fg-subtle">Tab titles, the welcome screens and the Riot notice.</p>
          </div>
          <div>
            <Label htmlFor="brand-team">Team name</Label>
            <Input id="brand-team" disabled={!isOwner} value={form.teamName} onChange={(e) => setForm({ ...form, teamName: e.target.value })} maxLength={60} />
          </div>
          <div>
            <Label htmlFor="brand-short">Short name</Label>
            <Input id="brand-short" disabled={!isOwner} value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value.toUpperCase() })} maxLength={14} />
          </div>
          <div>
            <Label htmlFor="brand-tagline">Tagline (optional)</Label>
            <Input id="brand-tagline" disabled={!isOwner} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={60} placeholder="Leave empty for none" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Images</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ImageCard kind="logo" title="Logo" hint="Sidebar, sign-in page and the browser tab." branding={form} onChange={onAssets} />
          <ImageCard kind="background" title="Sign-in background" hint="Behind the sign-in, first-run and recovery pages. A dark veil keeps the form readable." branding={form} onChange={onAssets} />
          <ImageCard kind="appBackground" title="App background" hint="Behind every page after signing in, under a dark veil so cards and text stay readable." branding={form} onChange={onAssets} />
        </div>
      </section>

      <BackdropSetting level={form.backdropLevel} saved={saved.backdropLevel} hasArtwork={!!form.assets.appBackground} disabled={!isOwner} onChange={(backdropLevel) => setForm((f) => ({ ...f, backdropLevel }))} />

      <section className="space-y-4 rounded-card border border-border bg-surface p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold">Colours</h2>
          <p className="text-sm text-fg-muted">Text stays light, so backgrounds and panels must stay dark enough to read.</p>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="space-y-2.5">
            {COLOUR_FIELDS.map((f) => {
              const value = form[f.key] ?? DEFAULT_COLOURS[f.key];
              const custom = form[f.key] !== null && form[f.key] !== DEFAULT_COLOURS[f.key];
              const check = checks.find((c) => c.key === f.key);
              return (
                <li key={f.key} className="flex flex-wrap items-center gap-3" data-testid={`colour-${f.key}`}>
                  <input type="color" aria-label={f.label} disabled={!isOwner} value={value} onChange={(e) => setColour(f.key, e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-bg-elevated" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg">{f.label}</div>
                    <div className="text-xs text-fg-muted">{f.hint}</div>
                  </div>
                  <div className="w-28 shrink-0">
                    <Input aria-label={`${f.label} hex`} disabled={!isOwner} value={value} onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && setColour(f.key, e.target.value.toLowerCase())} maxLength={7} className="font-mono md:h-9" />
                  </div>
                  <button type="button" disabled={!isOwner || !custom} onClick={() => setColour(f.key, null)} className="grid h-9 w-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30" aria-label={`Reset ${f.label} to default`} title="Default">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  {check && !check.ok ? <p className="w-full text-xs text-bad">{check.message}</p> : null}
                </li>
              );
            })}
          </ul>
          <div className="space-y-3">
            <Preview form={form} />
            <ul className="space-y-1 text-xs" aria-label="Contrast checks">
              {checks.map((c) => (
                <li key={c.key} className={cn("flex items-center gap-1.5", c.ok ? "text-fg-muted" : "text-bad")}>
                  {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-good" /> : <XCircle className="h-3.5 w-3.5" />} {c.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {isOwner ? (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-2 rounded-panel border border-border bg-bg-elevated/95 p-3 shadow-lg backdrop-blur md:bottom-4">
          <Button variant="primary" onClick={() => void save()} disabled={busy || !dirty || unreadable.length > 0} data-testid="branding-save">
            {busy ? "Saving…" : "Save branding"}
          </Button>
          <Button variant="outline" onClick={() => setForm((f) => ({ ...saved, assets: f.assets }))} disabled={busy || !dirty} data-testid="branding-cancel">
            Cancel changes
          </Button>
          <Button variant="ghost" onClick={() => void save(true)} disabled={busy}>
            Reset colours to defaults
          </Button>
          <span className="text-sm text-fg-muted">{unreadable.length ? "Fix the colours marked in red first." : dirty ? "Unsaved changes." : "Saved."}</span>
        </div>
      ) : null}
    </div>
  );
}
