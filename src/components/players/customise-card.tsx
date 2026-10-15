"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ImagePlus, LayoutGrid, Monitor, Paintbrush, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { championArtUrl, type CardAccent, type CardArt } from "@/domain/player-card";
import {
  accentCss,
  applyPreset,
  ART_SOURCES,
  AVATAR_FRAMES,
  BORDER_SOURCES,
  CARD_EMBLEMS,
  CARD_FRAMES,
  CARD_GRADIENTS,
  CARD_MOTIFS,
  CARD_PALETTES,
  CARD_PRESETS,
  CARD_THEMES,
  cleanTagline,
  DEFAULT_CARD_STYLE,
  legacyCardStyle,
  NAME_STYLES,
  PRESET_INFO,
  readableColour,
  TAGLINE_MAX,
  taglineProblem,
  type CardLook,
  type CardStyle,
} from "@/domain/card-style";
import { listChampionSkinsAction, removeCardBannerAction, setCardStyleAction, uploadCardBannerAction } from "@/server/actions/players";
import type { PickerChampion } from "@/components/champions/types";
import { ChampionGrid } from "@/components/champions/champion-grid";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { CardArtLayer } from "./card-art";
import { CardAvatar, CardFrame, CardName, CardTagline, cardShellStyle, EMBLEM_ICONS } from "./card-look";
import { prepareBanner } from "./banner-image";

export interface CustomiseCardProps {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  art: CardArt | null;
  /** The saved accent (cards saved before the Studio); `look` supersedes it when given. */
  accent: CardAccent;
  look?: CardLook | null;
  /** Every champion (search) and the player's own pool champions (listed first). */
  champions: PickerChampion[];
  poolIds: string[];
}

/** Skins already fetched in this tab, per champion. */
const skinCache = new Map<string, Array<{ num: number; name: string }>>();

/**
 * The Customise button on a card the viewer may edit (their own on Team, Players and the profile
 * header; any card for a player manager) and the Player Card Studio it opens. Nothing is saved
 * until Save; Cancel leaves the saved card exactly as it was.
 */
export function CustomiseCardButton(props: CustomiseCardProps & { variant?: "overlay" | "outline" | "icon"; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const icon = props.variant === "icon";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
          icon ? "h-8 w-8 rounded-full bg-bg/65 text-fg-muted backdrop-blur-sm hover:bg-bg/85 hover:text-accent pointer-coarse:h-11 pointer-coarse:w-11" : "min-h-9 px-2.5 pointer-coarse:min-h-11",
          !icon && (props.variant === "outline" ? "border border-border-strong bg-surface/70 text-fg hover:border-accent hover:text-accent" : "bg-bg/65 text-fg backdrop-blur-sm hover:bg-bg/85 hover:text-accent"),
          props.className,
        )}
        aria-label="Customise profile card"
        title="Player Card Studio: artwork, colours, frame, identity and effects"
        data-testid="customise-card"
      >
        <Paintbrush className={icon ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden /> {icon ? null : <span>Customise</span>}
      </button>
      {open ? <CardStudio {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const TABS = ["artwork", "colours", "frame", "identity", "effects"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { artwork: "Artwork", colours: "Colours", frame: "Frame", identity: "Identity", effects: "Effects" };

/** A banner change waiting for Save: a new picture (data URL) or removal. */
type BannerDraft = { kind: "keep" } | { kind: "new"; dataUrl: string } | { kind: "remove" };

function CardStudio({ playerId, name, avatarUrl, art, accent, look, champions, poolIds, onClose }: CustomiseCardProps & { onClose: () => void }) {
  const router = useRouter();
  const saved = React.useMemo<CardStyle>(() => look?.style ?? legacyCardStyle(accent), [look, accent]);
  const [style, setStyle] = React.useState<CardStyle>(saved);
  const [championId, setChampionId] = React.useState<string | null>(art?.championId ?? poolIds[0] ?? null);
  const [skinNum, setSkinNum] = React.useState(art?.skinNum ?? 0);
  const [banner, setBanner] = React.useState<BannerDraft>({ kind: "keep" });
  const [tab, setTab] = React.useState<Tab>("artwork");
  const [view, setView] = React.useState<"team" | "phone" | "directory">("team");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const bannerUrl = banner.kind === "new" ? banner.dataUrl : banner.kind === "remove" ? null : (look?.bannerUrl ?? null);
  const previewLook: CardLook = { style, bannerUrl };
  const previewArt: CardArt | null = championId ? { championId, skinNum } : null;
  const dirty = JSON.stringify(style) !== JSON.stringify(saved) || banner.kind !== "keep" || championId !== (art?.championId ?? poolIds[0] ?? null) || skinNum !== (art?.skinNum ?? 0);
  const tagProblem = style.identity.tagline ? taglineProblem(style.identity.tagline) : null;

  const set = (fn: (s: CardStyle) => CardStyle) => setStyle((s) => ({ ...fn(s), preset: s.preset }));
  const close = () => {
    if (dirty && !busy && !window.confirm("Discard your changes? The saved card stays as it was.")) return;
    onClose();
  };

  const save = async () => {
    if (tagProblem) return setError(tagProblem);
    setBusy(true);
    setError(null);
    // The banner first (it only shows when the style chooses it); then the look itself.
    if (banner.kind === "new") {
      const r = await uploadCardBannerAction(playerId, banner.dataUrl);
      if (!r.ok) {
        setBusy(false);
        setError(r.error);
        return;
      }
    } else if (banner.kind === "remove") {
      const r = await removeCardBannerAction(playerId);
      if (!r.ok) {
        setBusy(false);
        setError(r.error);
        return;
      }
    }
    const finalStyle = style.art.source === "banner" && !bannerUrl ? { ...style, art: { ...style.art, source: "champion" as const } } : style;
    const r = await setCardStyleAction(playerId, { featuredChampionId: championId, featuredSkinNum: skinNum, style: finalStyle as unknown as Record<string, unknown> });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success("Card saved.", { description: "It shows on Team, Players, your profile and the draft lineup." });
    onClose();
    router.refresh();
  };

  return (
    <Dialog
      open
      onClose={close}
      title="Player Card Studio"
      description="Make the card yours. Nothing changes until you save; Cancel keeps the saved card."
      className="sm:max-w-6xl"
      tall
      footer={
        <>
          {error ? (
            <p role="alert" className="mr-auto self-center text-sm text-bad" data-testid="studio-error">
              {error}
            </p>
          ) : null}
          <Button variant="ghost" onClick={() => setStyle({ ...DEFAULT_CARD_STYLE, identity: { ...DEFAULT_CARD_STYLE.identity, tagline: style.identity.tagline, emblem: style.identity.emblem } })} disabled={busy} className={cn(!error && "mr-auto")} data-testid="studio-reset-all" title="Back to the standard UNIIVERSE look (your champion, tagline and emblem stay)">
            <RotateCcw className="h-4 w-4" /> Reset look
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy} data-testid="studio-cancel">
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !!tagProblem} data-testid="save-card-style">
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-6" data-testid="card-studio">
        {/* Phones: this wrapper dissolves into the grid so the preview stays stuck for the whole scroll. */}
        <div className="min-w-0 max-lg:contents lg:sticky lg:top-0 lg:space-y-3 lg:self-start">
        {/* Live preview: sticky on phones too, so every change is visible while scrolling the controls. */}
        <div className="sticky -top-3 z-10 -mx-4 space-y-2 border-b border-border bg-bg-elevated/95 px-4 pb-2 pt-1 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-fg-subtle">Preview</span>
            <div role="radiogroup" aria-label="Preview" className="flex rounded-lg border border-border p-0.5">
              {(
                [
                  ["team", Monitor, "Team card"],
                  ["phone", Smartphone, "Phone"],
                  ["directory", LayoutGrid, "Players"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cn("inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs pointer-coarse:min-h-10", view === v ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg")} data-testid={`preview-${v}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden /> <span className="max-sm:sr-only">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <StudioPreview view={view} look={previewLook} art={previewArt} name={name} avatarUrl={avatarUrl} />
        </div>
        <Presets style={style} onApply={(id) => setStyle((s) => applyPreset(s, id))} />
        </div>

        <div className="min-w-0">
          <div role="tablist" aria-label="Customisation" className="mb-3 grid grid-cols-5 gap-1 rounded-xl border border-border bg-surface p-1" data-testid="studio-tabs">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("min-h-9 truncate rounded-lg px-1 text-xs font-medium transition-colors pointer-coarse:min-h-11 sm:text-sm", tab === t ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg")} data-testid={`studio-tab-${t}`}>
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={TAB_LABEL[tab]} className="space-y-4">
            {tab === "artwork" ? (
              <ArtworkPanel style={style} set={set} championId={championId} skinNum={skinNum} champions={champions} poolIds={poolIds} onChampion={(id) => (id !== championId ? (setChampionId(id), setSkinNum(0)) : null)} onSkin={setSkinNum} bannerUrl={bannerUrl} onBanner={setBanner} hasSavedBanner={!!look?.bannerUrl} />
            ) : null}
            {tab === "colours" ? <ColoursPanel style={style} set={set} /> : null}
            {tab === "frame" ? <FramePanel style={style} set={set} /> : null}
            {tab === "identity" ? <IdentityPanel style={style} set={set} problem={tagProblem} /> : null}
            {tab === "effects" ? <EffectsPanel style={style} set={set} /> : null}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ── Preview ─────────────────────────────────────────────────────────────────────────────────────

/** The real card pieces with placeholder figures: what Team, a phone and the Players directory will show. */
function StudioPreview({ view, look, art, name, avatarUrl }: { view: "team" | "phone" | "directory"; look: CardLook; art: CardArt | null; name: string; avatarUrl: string | null }) {
  const accent = accentCss(look.style);
  if (view === "directory") {
    return (
      <div className="mx-auto w-full max-w-[17rem]" data-testid="card-preview" data-view="directory">
        <div className="relative flex flex-col overflow-hidden rounded-2xl border" style={cardShellStyle(look, { glow: false })}>
          <CardFrame look={look} />
          <div className="relative h-24">
            <CardArtLayer art={art} accent={accent} kind="loading" position="center 16%" look={look} decorate={false} testId="preview-art" />
          </div>
          <div className="relative -mt-9 flex flex-col gap-2 px-4 pb-4">
            <div className="flex items-end gap-3">
              <CardAvatar look={look} name={name} src={avatarUrl} size="lg" />
              <div className="min-w-0 flex-1 pb-0.5">
                <CardName look={look} name={name} className="text-base text-fg" />
                <CardTagline look={look} reserve />
              </div>
            </div>
            <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className="h-8 w-8 rounded-md bg-surface-3" />)}</div>
          </div>
        </div>
      </div>
    );
  }
  const phone = view === "phone";
  return (
    <div className={cn("mx-auto w-full", phone ? "max-w-[20rem]" : "max-w-[24rem]")} data-testid="card-preview" data-view={view} data-frame={look.style.frame}>
      <article className="relative flex flex-col overflow-hidden rounded-2xl border" style={cardShellStyle(look)}>
        <CardFrame look={look} />
        <div className={cn("relative shrink-0 overflow-hidden", phone ? "h-32" : "h-32 lg:h-36")}>
          <CardArtLayer art={art} accent={accent} kind="splash" position="center 22%" look={look} testId="preview-art" />
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-bg/75 px-3 py-1 text-sm font-semibold uppercase tracking-[0.14em] text-fg backdrop-blur-sm">
            <span style={{ color: "var(--card-accent)" }}>●</span>&nbsp;Role
          </span>
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 px-3 pb-2.5">
            <CardAvatar look={look} name={name} src={avatarUrl} size="lg" />
            <span className="min-w-0 pb-0.5">
              <CardTagline look={look} className="drop-shadow" />
              <CardName look={look} name={name} className="text-lg leading-tight text-fg drop-shadow" />
              <span className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
                Rank <span className="rounded-full border border-good/35 bg-good/10 px-1.5 py-px text-[0.6875rem] font-semibold text-good">Main Role</span>
              </span>
            </span>
          </div>
        </div>
        <div className={cn("grid grid-cols-4 gap-1.5 px-3.5 pb-3.5 pt-3 text-center max-lg:hidden", phone && "pb-3")}>
          {["Games", "Win rate", "KDA", "CS/min"].map((l) => (
            <div key={l} className="rounded-lg bg-bg-elevated px-1 py-1.5">
              <div className="text-xs text-fg-subtle">{l}</div>
              <div className="text-base font-semibold tabular-nums text-fg">—</div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function Presets({ style, onApply }: { style: CardStyle; onApply: (id: (typeof CARD_PRESETS)[number]) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-fg-subtle">Presets · a starting point you can change</div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-wrap lg:overflow-visible" data-testid="studio-presets">
        {CARD_PRESETS.map((id) => {
          const p = PRESET_INFO[id];
          const on = style.preset === id;
          return (
            <button key={id} type="button" onClick={() => onApply(id)} aria-pressed={on} title={p.description} className={cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors pointer-coarse:min-h-11", on ? "border-accent bg-accent/15 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")} data-testid={`preset-${id}`}>
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: `linear-gradient(135deg, ${p.look.colours.primary}, ${p.look.colours.secondary})` }} aria-hidden />
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────────────────────────

type Setter = (fn: (s: CardStyle) => CardStyle) => void;

/** A labelled setting with a reset-to-standard button when it differs from the standard card. */
function Field({ label, hint, changed, onReset, children, testId }: { label: string; hint?: string; changed: boolean; onReset: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="text-sm font-medium text-fg">
          {label}
          {hint ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">{hint}</span> : null}
        </span>
        {changed ? (
          <button type="button" onClick={onReset} className="inline-flex min-h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg pointer-coarse:min-h-10" aria-label={`Reset ${label}`} data-testid="reset-setting">
            <RotateCcw className="h-3 w-3" aria-hidden /> Reset
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Choice<T extends string>({ value, options, labels, onChange, label, columns = 4 }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void; label: string; columns?: number }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-1.5", columns === 5 ? "grid-cols-3 sm:grid-cols-5" : columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={cn("min-h-9 truncate rounded-lg border px-2 text-xs font-medium transition-colors pointer-coarse:min-h-11", value === o ? "border-accent bg-accent/15 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")} data-value={o}>
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, min, max, step = 1, onChange, label, format }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; format?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="h-9 min-w-0 flex-1 cursor-pointer accent-[var(--color-accent)] pointer-coarse:h-11" />
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-fg-muted">{format ? format(value) : value}</span>
    </div>
  );
}

function ColourPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [text, setText] = React.useState(value);
  const [shown, setShown] = React.useState(value);
  // A swatch, preset or reset changed the colour: show it in the text field too.
  if (shown !== value) {
    setShown(value);
    setText(value);
  }
  const swatches = [...new Set(CARD_PALETTES.flatMap((p) => [p.primary, p.secondary]))].slice(0, 14);
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {swatches.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} title={c} onClick={() => onChange(c)} className={cn("grid h-8 w-8 place-items-center rounded-full border-2 pointer-coarse:h-10 pointer-coarse:w-10", value === c ? "border-fg" : "border-transparent")} style={{ background: c }}>
            {value === c ? <Check className="h-3.5 w-3.5 text-bg" aria-hidden /> : null}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} aria-label={`${label}: custom`} className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-bg-elevated pointer-coarse:h-11" />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          maxLength={7}
          spellCheck={false}
          aria-label={`${label}: hex value`}
          className="h-9 w-28 rounded-lg border border-border bg-bg-elevated px-2.5 font-mono text-sm text-fg pointer-coarse:h-11"
        />
      </div>
    </div>
  );
}

// ── Panels ──────────────────────────────────────────────────────────────────────────────────────

const D = DEFAULT_CARD_STYLE;

function ArtworkPanel({ style, set, championId, skinNum, champions, poolIds, onChampion, onSkin, bannerUrl, onBanner, hasSavedBanner }: { style: CardStyle; set: Setter; championId: string | null; skinNum: number; champions: PickerChampion[]; poolIds: string[]; onChampion: (id: string) => void; onSkin: (n: number) => void; bannerUrl: string | null; onBanner: (b: BannerDraft) => void; hasSavedBanner: boolean }) {
  const [fetched, setFetched] = React.useState<{ id: string; list: Array<{ num: number; name: string }> } | null>(null);
  const skins = championId ? (skinCache.get(championId) ?? (fetched?.id === championId ? fetched.list : null)) : [];
  const [preparing, setPreparing] = React.useState(false);
  const [advanced, setAdvanced] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const pool = React.useMemo(() => new Set(poolIds), [poolIds]);
  const champName = champions.find((c) => c.id === championId)?.name ?? championId ?? "";
  React.useEffect(() => {
    if (!championId || skinCache.has(championId)) return;
    let live = true;
    void listChampionSkinsAction(championId).then((r) => {
      const list = r.ok && r.data?.length ? r.data : [{ num: 0, name: "Default" }];
      skinCache.set(championId, list);
      if (live) setFetched({ id: championId, list });
    });
    return () => {
      live = false;
    };
  }, [championId]);
  const art = style.art;
  const pickFile = async (f: File | null) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setPreparing(true);
    try {
      const dataUrl = await prepareBanner(f);
      onBanner({ kind: "new", dataUrl });
      set((s) => ({ ...s, art: { ...s.art, source: "banner" } }));
    } catch (err) {
      toast.error((err as Error).message || "That file could not be read as an image.");
    } finally {
      setPreparing(false);
    }
  };
  return (
    <>
      <Field label="Background" changed={art.source !== D.art.source} onReset={() => set((s) => ({ ...s, art: { ...s.art, source: D.art.source } }))}>
        <Choice label="Background" value={art.source} options={ART_SOURCES} labels={{ champion: "Champion art", banner: "My banner", none: "Colours only" }} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, source: v } }))} columns={3} />
      </Field>

      {art.source === "banner" ? (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-3" data-testid="banner-panel">
          <p className="text-xs text-fg-muted">A landscape picture of your own (PNG, JPEG or WebP). It is resized in your browser before upload and only members can see it. If it cannot be shown, your champion art is used.</p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} data-testid="banner-file" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={preparing}>
              <ImagePlus className="h-4 w-4" /> {preparing ? "Preparing…" : bannerUrl ? "Replace banner" : "Upload banner"}
            </Button>
            {bannerUrl ? (
              <Button variant="ghost" size="sm" onClick={() => (onBanner(hasSavedBanner ? { kind: "remove" } : { kind: "keep" }), set((s) => ({ ...s, art: { ...s.art, source: "champion" } })))}>
                <Trash2 className="h-4 w-4" /> Remove banner
              </Button>
            ) : null}
          </div>
          {!bannerUrl ? <p className="text-xs text-warn">No banner yet: the card shows your champion art until you upload one.</p> : null}
        </div>
      ) : null}

      {art.source !== "none" ? (
        <>
          <section className="space-y-1.5">
            <h3 className="text-sm font-medium text-fg">Champion {art.source === "banner" ? <span className="text-xs font-normal text-fg-subtle">· used when there is no banner</span> : null}</h3>
            <ChampionGrid champions={champions} selectedIds={new Set(championId ? [championId] : [])} onPick={onChampion} prioritisedIds={pool} prioritisedLabel="in your pools" maxHeight={200} size="sm" testId="customise-champions" placeholder="Search any champion…" progressive />
          </section>
          <section className="space-y-1.5">
            <h3 className="text-sm font-medium text-fg">Skin {champName ? <span className="text-xs font-normal text-fg-subtle">· {champName} · any skin may be shown; it does not mean you own it</span> : null}</h3>
            {!championId ? (
              <p className="text-sm text-fg-subtle">Choose a champion first.</p>
            ) : skins === null ? (
              <p className="text-sm text-fg-subtle" aria-live="polite">
                Loading skins…
              </p>
            ) : (
              <SkinChooser key={championId} championId={championId} skins={skins} value={skinNum} onChange={onSkin} />
            )}
          </section>
        </>
      ) : null}

      <button type="button" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} className="flex min-h-9 w-full items-center justify-between rounded-lg border border-border px-3 text-sm font-medium text-fg hover:border-border-strong pointer-coarse:min-h-11" data-testid="artwork-advanced">
        Position, crop and readability
        <ChevronDown className={cn("h-4 w-4 transition-transform", advanced && "rotate-180")} aria-hidden />
      </button>
      {advanced ? (
        <div className="space-y-3">
          <Field label="Horizontal focus" hint={art.focusX === null ? "automatic" : undefined} changed={art.focusX !== null} onReset={() => set((s) => ({ ...s, art: { ...s.art, focusX: null } }))} testId="field-focus-x">
            <Slider label="Horizontal focus" value={art.focusX ?? 50} min={0} max={100} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, focusX: v } }))} format={(v) => `${v}%`} />
          </Field>
          <Field label="Vertical focus" hint={art.focusY === null ? "automatic" : undefined} changed={art.focusY !== null} onReset={() => set((s) => ({ ...s, art: { ...s.art, focusY: null } }))} testId="field-focus-y">
            <Slider label="Vertical focus" value={art.focusY ?? 20} min={0} max={100} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, focusY: v } }))} format={(v) => `${v}%`} />
          </Field>
          <Field label="Zoom" changed={art.zoom !== D.art.zoom} onReset={() => set((s) => ({ ...s, art: { ...s.art, zoom: D.art.zoom } }))} testId="field-zoom">
            <Slider label="Zoom" value={art.zoom} min={1} max={2} step={0.05} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, zoom: v } }))} format={(v) => `${Math.round(v * 100)}%`} />
          </Field>
          <Field label="Background darkness" hint="keeps text readable" changed={art.darkness !== D.art.darkness} onReset={() => set((s) => ({ ...s, art: { ...s.art, darkness: D.art.darkness } }))} testId="field-darkness">
            <Slider label="Background darkness" value={art.darkness} min={25} max={90} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, darkness: v } }))} format={(v) => `${v}%`} />
          </Field>
          <Field label="Background blur" changed={art.blur !== D.art.blur} onReset={() => set((s) => ({ ...s, art: { ...s.art, blur: D.art.blur } }))} testId="field-blur">
            <Slider label="Background blur" value={art.blur} min={0} max={12} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, blur: v } }))} format={(v) => `${v}px`} />
          </Field>
          <Field label="Vignette" changed={art.vignette !== D.art.vignette} onReset={() => set((s) => ({ ...s, art: { ...s.art, vignette: D.art.vignette } }))} testId="field-vignette">
            <Slider label="Vignette" value={art.vignette} min={0} max={80} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, vignette: v } }))} format={(v) => `${v}%`} />
          </Field>
        </div>
      ) : null}
    </>
  );
}

function ColoursPanel({ style, set }: { style: CardStyle; set: Setter }) {
  const c = style.colours;
  const lifted = readableColour(c.primary) !== c.primary;
  return (
    <>
      <Field label="Palettes" hint="one tap sets both colours" changed={false} onReset={() => undefined}>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5" data-testid="palettes">
          {CARD_PALETTES.map((p) => {
            const on = c.primary === p.primary && c.secondary === p.secondary;
            return (
              <button key={p.label} type="button" aria-pressed={on} onClick={() => set((s) => ({ ...s, colours: { ...s.colours, primary: p.primary, secondary: p.secondary } }))} className={cn("flex min-h-10 items-center gap-2 rounded-lg border px-2 text-xs font-medium pointer-coarse:min-h-11", on ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted hover:text-fg")}>
                <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)` }} aria-hidden />
                <span className="truncate">{p.label}</span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Primary colour" changed={c.primary !== D.colours.primary} onReset={() => set((s) => ({ ...s, colours: { ...s.colours, primary: D.colours.primary } }))} testId="field-primary">
        <ColourPicker label="Primary colour" value={c.primary} onChange={(v) => set((s) => ({ ...s, colours: { ...s.colours, primary: v } }))} />
        {lifted ? (
          <p className="text-xs text-fg-subtle" data-testid="contrast-note">
            Text and icons use a lighter shade of this colour so they stay readable.
          </p>
        ) : null}
      </Field>
      <Field label="Secondary colour" changed={c.secondary !== D.colours.secondary} onReset={() => set((s) => ({ ...s, colours: { ...s.colours, secondary: D.colours.secondary } }))} testId="field-secondary">
        <ColourPicker label="Secondary colour" value={c.secondary} onChange={(v) => set((s) => ({ ...s, colours: { ...s.colours, secondary: v } }))} />
      </Field>
      <Field label="Colour wash" hint="primary → secondary over the art" changed={c.gradient !== D.colours.gradient} onReset={() => set((s) => ({ ...s, colours: { ...s.colours, gradient: D.colours.gradient } }))}>
        <Choice label="Colour wash" value={c.gradient} options={CARD_GRADIENTS} labels={{ none: "None", diagonal: "Diagonal", horizontal: "Across", radial: "Halo" }} onChange={(v) => set((s) => ({ ...s, colours: { ...s.colours, gradient: v } }))} />
      </Field>
      <Field label="Highlight" changed={c.highlight !== D.colours.highlight} onReset={() => set((s) => ({ ...s, colours: { ...s.colours, highlight: D.colours.highlight } }))}>
        <Slider label="Highlight" value={c.highlight} min={0} max={40} onChange={(v) => set((s) => ({ ...s, colours: { ...s.colours, highlight: v } }))} format={(v) => `${v}%`} />
      </Field>
      <Field label="Border" changed={c.border !== D.colours.border} onReset={() => set((s) => ({ ...s, colours: { ...s.colours, border: D.colours.border } }))}>
        <Choice label="Border" value={c.border} options={BORDER_SOURCES} labels={{ subtle: "Subtle", primary: "Primary", secondary: "Secondary", gradient: "Gradient" }} onChange={(v) => set((s) => ({ ...s, colours: { ...s.colours, border: v } }))} />
      </Field>
      <Field label="Avatar frame" changed={c.avatarFrame !== D.colours.avatarFrame} onReset={() => set((s) => ({ ...s, colours: { ...s.colours, avatarFrame: D.colours.avatarFrame } }))}>
        <Choice label="Avatar frame" value={c.avatarFrame} options={AVATAR_FRAMES} labels={{ primary: "Primary", secondary: "Secondary", gradient: "Gradient", neutral: "Neutral", none: "None" }} onChange={(v) => set((s) => ({ ...s, colours: { ...s.colours, avatarFrame: v } }))} columns={5} />
      </Field>
    </>
  );
}

const FRAME_LABEL: Record<CardStyle["frame"], string> = { none: "No frame", minimal: "Minimal", outline: "Clean outline", double: "Double line", angular: "Angular", glow: "Soft glow", premium: "Premium" };

function FramePanel({ style, set }: { style: CardStyle; set: Setter }) {
  return (
    <Field label="Card frame" hint="drawn inside the card: sizes never change" changed={style.frame !== D.frame} onReset={() => set((s) => ({ ...s, frame: D.frame }))}>
      <div role="radiogroup" aria-label="Card frame" className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="frame-options">
        {CARD_FRAMES.map((f) => {
          const look: CardLook = { style: { ...style, frame: f, effects: { ...style.effects, glow: false } }, bannerUrl: null };
          return (
            <button key={f} type="button" role="radio" aria-checked={style.frame === f} onClick={() => set((s) => ({ ...s, frame: f }))} className={cn("rounded-xl border p-1.5 text-left transition-colors", style.frame === f ? "border-accent ring-1 ring-accent" : "border-border hover:border-border-strong")} data-value={f}>
              <span className="relative block h-14 overflow-hidden rounded-lg border" style={cardShellStyle(look, { glow: false })}>
                <CardFrame look={look} />
                <span className="absolute inset-x-3 bottom-2 h-1.5 rounded-full" style={{ background: "var(--card-accent)" }} />
              </span>
              <span className="mt-1 block truncate px-0.5 text-xs font-medium text-fg">{FRAME_LABEL[f]}</span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function IdentityPanel({ style, set, problem }: { style: CardStyle; set: Setter; problem: string | null }) {
  const id = style.identity;
  const [text, setText] = React.useState(id.tagline);
  // Reset or a preset changed the tagline: show the saved text (typing keeps its own spaces).
  if (cleanTagline(text) !== id.tagline) setText(id.tagline);
  return (
    <>
      <Field label="Tagline" hint={`optional · ${TAGLINE_MAX} characters`} changed={id.tagline !== ""} onReset={() => set((s) => ({ ...s, identity: { ...s.identity, tagline: "" } }))} testId="field-tagline">
        <input
          type="text"
          value={text}
          maxLength={TAGLINE_MAX + 10}
          onChange={(e) => {
            setText(e.target.value);
            set((s) => ({ ...s, identity: { ...s.identity, tagline: cleanTagline(e.target.value) } }));
          }}
          placeholder="In your own words, e.g. “Calm in the chaos”"
          className="h-10 w-full rounded-lg border border-border bg-bg-elevated px-3 text-sm text-fg placeholder:text-fg-subtle pointer-coarse:h-11"
          aria-describedby="tagline-help"
          data-testid="tagline-input"
        />
        <div id="tagline-help" className="flex justify-between gap-2 text-xs">
          <span className={problem ? "text-bad" : "text-fg-subtle"} data-testid="tagline-problem">
            {problem ?? "Plain text, one line. Ranks and official titles come from Riot data, not taglines."}
          </span>
          <span className="shrink-0 tabular-nums text-fg-subtle">
            {[...id.tagline].length}/{TAGLINE_MAX}
          </span>
        </div>
      </Field>
      <Field label="Emblem" hint="beside your name" changed={id.emblem !== null} onReset={() => set((s) => ({ ...s, identity: { ...s.identity, emblem: null } }))}>
        <div role="radiogroup" aria-label="Emblem" className="grid grid-cols-6 gap-1.5 sm:grid-cols-9" data-testid="emblem-options">
          <button type="button" role="radio" aria-checked={id.emblem === null} onClick={() => set((s) => ({ ...s, identity: { ...s.identity, emblem: null } }))} className={cn("grid h-10 place-items-center rounded-lg border text-xs text-fg-muted pointer-coarse:h-11", id.emblem === null ? "border-accent bg-accent/15" : "border-border")}>
            None
          </button>
          {CARD_EMBLEMS.map((e) => {
            const Icon = EMBLEM_ICONS[e];
            return (
              <button key={e} type="button" role="radio" aria-checked={id.emblem === e} aria-label={e} title={e} onClick={() => set((s) => ({ ...s, identity: { ...s.identity, emblem: e } }))} className={cn("grid h-10 place-items-center rounded-lg border pointer-coarse:h-11", id.emblem === e ? "border-accent bg-accent/15 text-accent" : "border-border text-fg-muted hover:text-fg")} data-value={e}>
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Name style" changed={id.nameStyle !== D.identity.nameStyle} onReset={() => set((s) => ({ ...s, identity: { ...s.identity, nameStyle: D.identity.nameStyle } }))}>
        <Choice label="Name style" value={id.nameStyle} options={NAME_STYLES} labels={{ standard: "Standard", bold: "Bold", wide: "Wide caps", italic: "Italic" }} onChange={(v) => set((s) => ({ ...s, identity: { ...s.identity, nameStyle: v } }))} />
      </Field>
      <Field label="Card theme" changed={id.theme !== D.identity.theme} onReset={() => set((s) => ({ ...s, identity: { ...s.identity, theme: D.identity.theme } }))}>
        <Choice label="Card theme" value={id.theme} options={CARD_THEMES} labels={{ midnight: "Midnight", deep: "Deep", tinted: "Tinted" }} onChange={(v) => set((s) => ({ ...s, identity: { ...s.identity, theme: v } }))} columns={3} />
      </Field>
    </>
  );
}

function EffectsPanel({ style, set }: { style: CardStyle; set: Setter }) {
  const fx = style.effects;
  const any = fx.glow || fx.shimmer || fx.drift || fx.motif !== "none";
  return (
    <>
      <p className="text-xs text-fg-subtle">Decorative and optional. Animations stop for anyone whose device asks for reduced motion, and small cards leave them out.</p>
      <div className="rounded-xl border border-border bg-surface px-1 py-1">
        <Switch id="fx-glow" label="Ambient glow" description="A soft light around the card in your primary colour." checked={fx.glow} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, glow: v } }))} />
        <Switch id="fx-shimmer" label="Accent shimmer" description="A slow sheen across the artwork (animated)." checked={fx.shimmer} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, shimmer: v } }))} />
        <Switch id="fx-drift" label="Moving colour wash" description={style.colours.gradient === "none" ? "Choose a colour wash under Colours first." : "The colour wash drifts gently (animated)."} disabled={style.colours.gradient === "none"} checked={fx.drift && style.colours.gradient !== "none"} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, drift: v } }))} />
      </div>
      <Field label="Motif" changed={fx.motif !== D.effects.motif} onReset={() => set((s) => ({ ...s, effects: { ...s.effects, motif: D.effects.motif } }))}>
        <Choice label="Motif" value={fx.motif} options={CARD_MOTIFS} labels={{ none: "None", corners: "Corners", lines: "Lines", dots: "Dots", rings: "Rings" }} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, motif: v } }))} columns={5} />
      </Field>
      <Field label="Intensity" hint={any ? undefined : "turn an effect on to use it"} changed={fx.intensity !== D.effects.intensity} onReset={() => set((s) => ({ ...s, effects: { ...s.effects, intensity: D.effects.intensity } }))} testId="field-intensity">
        <Slider label="Effect intensity" value={fx.intensity} min={0} max={100} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, intensity: v } }))} format={(v) => `${v}%`} />
      </Field>
    </>
  );
}

/**
 * The artwork choice: one thumbnail per distinct illustration (chromas and duplicate images are
 * left out on the server), default first, searchable by name. A thumbnail whose image cannot load
 * removes its whole option rather than leaving a blank card.
 */
function SkinChooser({ championId, skins, value, onChange }: { championId: string; skins: Array<{ num: number; name: string }>; value: number; onChange: (num: number) => void }) {
  const [query, setQuery] = React.useState("");
  const [broken, setBroken] = React.useState<Set<number>>(() => new Set());
  const q = query.trim().toLowerCase();
  const shown = skins.filter((s) => !broken.has(s.num) && (!q || s.name.toLowerCase().includes(q) || s.num === 0));
  return (
    <div className="space-y-2">
      {skins.length > 6 ? (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${skins.length - 1} skins…`}
          aria-label="Search skins"
          className="h-9 w-full rounded-lg border border-border bg-bg-elevated px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11"
          data-testid="skin-search"
        />
      ) : null}
      <ul role="radiogroup" aria-label="Skin artwork" className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto pr-1 min-[420px]:grid-cols-4 sm:grid-cols-5 xl:grid-cols-6" data-testid="skin-options">
        {shown.map((s) => {
          const on = s.num === value;
          return (
            <li key={s.num}>
              <button type="button" role="radio" aria-checked={on} onClick={() => onChange(s.num)} title={s.name} className={cn("group w-full overflow-hidden rounded-lg border text-left transition-colors", on ? "border-accent ring-2 ring-accent" : "border-border hover:border-border-strong")} data-testid="skin-option" data-num={s.num}>
                <span className="relative block aspect-[4/5] overflow-hidden bg-surface-2">
                  {/* Loading-screen art is small (a few dozen KB): fine as a thumbnail. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={championArtUrl({ championId, skinNum: s.num }, "loading")}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover object-top transition-transform motion-safe:group-hover:scale-105"
                    onError={() => {
                      if (s.num !== 0) setBroken((b) => new Set(b).add(s.num));
                    }}
                  />
                  {on ? (
                    <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-bg">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span className="block truncate px-1.5 py-1 text-[11px] text-fg">{s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {q && shown.length <= 1 ? <p className="text-xs text-fg-subtle">No skin matches “{query}”.</p> : null}
    </div>
  );
}
