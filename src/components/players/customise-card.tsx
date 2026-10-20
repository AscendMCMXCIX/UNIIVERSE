"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchInput } from "@/components/ui/search-input";
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, ImagePlus, LayoutGrid, Monitor, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { championArtUrl, type CardAccent, type CardArt } from "@/domain/player-card";
import {
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
import { cardPreviewFiguresAction, listChampionSkinsAction, removeCardBannerAction, setCardStyleAction, uploadCardBannerAction } from "@/server/actions/players";
import { ownSocialLinksAction, saveSocialLinksAction } from "@/server/actions/account";
import { visibleSocialLinks, type SocialKind } from "@/domain/social-links";
import { SocialLinksFields, socialDraftChanged, socialDraftLinks, socialDraftOf, socialDraftProblems, type SocialDraft } from "@/components/settings/social-links-editor";
import type { PickerChampion } from "@/components/champions/types";
import { ChampionGrid } from "@/components/champions/champion-grid";
import { Button } from "@/components/ui/button";
import { DetailModal } from "@/components/ui/detail-modal";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { CardFrame, cardShellStyle, EMBLEM_ICONS } from "./card-look";
import type { CardSeason } from "./player-card";
import { prepareBanner } from "./banner-image";
import { CardPreview, type StudioPreviewData } from "./card-preview";

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
  /** The player's real card content for the preview (role, rank, season figures, role pool); placeholders where absent. */
  preview?: StudioPreviewData;
  /**
   * The card is the viewer's own: the Studio also edits their YouTube, Twitch and Discord (the
   * Links step, saved with the card). Never for someone else's card: links are always the session's own.
   */
  ownLinks?: boolean;
}

export type { StudioPreviewData } from "./card-preview";

/** Skins already fetched in this tab, per champion. */
const skinCache = new Map<string, Array<{ num: number; name: string }>>();

/**
 * The Studio's steps, in the order most players go: a preset and the background, then the artwork,
 * its position, colours, identity, links (on your own card) and effects. Every step can be opened
 * directly (the step bar is the shortcut), and each one fits the window beside the preview without
 * scrolling on a desktop.
 */
const STEPS = ["style", "artwork", "position", "colours", "identity", "effects"] as const;
const OWN_STEPS = ["style", "artwork", "position", "colours", "identity", "links", "effects"] as const;
type Step = (typeof OWN_STEPS)[number];
const STEP_INFO: Record<Step, { label: string; hint: string }> = {
  style: { label: "Style", hint: "Preset, background and frame" },
  artwork: { label: "Artwork", hint: "Champion and skin" },
  position: { label: "Position", hint: "Focus, zoom and veil" },
  colours: { label: "Colours", hint: "Palette, custom colours and border" },
  identity: { label: "Identity", hint: "Tagline, emblem and name" },
  links: { label: "Links", hint: "YouTube, Twitch and Discord" },
  effects: { label: "Effects", hint: "Glow, shimmer and motif" },
};

/** The Links step's state: loading, the links as saved and as edited, or why they could not be loaded. */
type LinksState = { kind: "loading" } | { kind: "ready"; saved: SocialDraft; draft: SocialDraft } | { kind: "failed"; error: string };

/** A banner change waiting for Save: a new picture (data URL) or removal. */
type BannerDraft = { kind: "keep" } | { kind: "new"; dataUrl: string } | { kind: "remove" };

/**
 * The Player Card Studio, opened by CustomiseCardButton (customise-card-button.tsx), which loads
 * this module only when it is first wanted. Nothing is saved until Save; Cancel leaves the saved
 * card exactly as it was.
 */
export function CardStudio({ playerId, name, avatarUrl, art, accent, look, champions, poolIds, preview, ownLinks = false, onClose }: CustomiseCardProps & { onClose: () => void }) {
  const steps: readonly Step[] = ownLinks ? OWN_STEPS : STEPS;
  const router = useRouter();
  const saved = React.useMemo<CardStyle>(() => look?.style ?? legacyCardStyle(accent), [look, accent]);
  const initialPick = React.useMemo(() => ({ championId: art?.championId ?? poolIds[0] ?? null, skinNum: art?.skinNum ?? 0 }), [art, poolIds]);
  const [style, setStyle] = React.useState<CardStyle>(saved);
  const [pick, setPick] = React.useState(initialPick);
  const [banner, setBanner] = React.useState<BannerDraft>({ kind: "keep" });
  const [step, setStep] = React.useState<Step>("style");
  const [view, setView] = React.useState<"team" | "phone" | "directory">("team");
  // Phones and tablets: the pinned preview can be put away to give the controls the screen.
  const [previewShown, setPreviewShown] = React.useState(true);
  // The pinned preview's height, given to the window's scrolling area as room to keep clear: a
  // control the browser scrolls to (a focused field, the next slider) lands below the preview.
  const pinned = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = pinned.current;
    const body = el?.parentElement?.parentElement;
    if (!el || !body || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => body.style.setProperty("--studio-pinned", `${Math.round(el.getBoundingClientRect().height)}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The profile does not load the Team card's figures; fetch them once so the preview shows the
  // real card. "loading" keeps the tiles as placeholders meanwhile; null means none to show.
  const [figures, setFigures] = React.useState<CardSeason | null | "loading">(preview && preview.season === null ? "loading" : (preview?.season ?? null));
  React.useEffect(() => {
    if (!preview || preview.season !== null) return;
    let live = true;
    void cardPreviewFiguresAction(playerId, preview.role ?? null).then((r) => {
      if (live) setFigures(r.ok ? (r.data?.season ?? null) : null);
    });
    return () => {
      live = false;
    };
  }, [playerId, preview]);
  // Your own card: your links as stored (every audience), loaded once when the Studio opens.
  const [links, setLinks] = React.useState<LinksState | null>(ownLinks ? { kind: "loading" } : null);
  React.useEffect(() => {
    if (!ownLinks) return;
    let live = true;
    void ownSocialLinksAction().then((r) => {
      if (!live) return;
      if (r.ok) {
        const stored = socialDraftOf(r.data.links);
        setLinks({ kind: "ready", saved: stored, draft: stored });
      } else setLinks({ kind: "failed", error: r.error });
    });
    return () => {
      live = false;
    };
  }, [ownLinks]);
  const linksDraft = links?.kind === "ready" ? links.draft : null;
  const linksChanged = links?.kind === "ready" && socialDraftChanged(links.draft, links.saved);
  const linksProblem = linksDraft ? (Object.values(socialDraftProblems(linksDraft)).find(Boolean) ?? null) : null;
  // The preview's icons follow the links as they are edited (what teammates would see).
  const previewSocial = React.useMemo(() => (linksDraft ? visibleSocialLinks(socialDraftLinks(linksDraft), "team") : undefined), [linksDraft]);
  const previewData = React.useMemo<StudioPreviewData | null>(() => (preview ? { ...preview, season: figures === "loading" ? null : figures, ...(previewSocial ? { social: previewSocial } : {}) } : null), [preview, figures, previewSocial]);

  const bannerUrl = banner.kind === "new" ? banner.dataUrl : banner.kind === "remove" ? null : (look?.bannerUrl ?? null);
  // The champion grid and skins never re-render for a style change (stable props, memoised).
  const previewLook = React.useMemo<CardLook>(() => ({ style, bannerUrl }), [style, bannerUrl]);
  const previewArt = React.useMemo<CardArt | null>(() => (pick.championId ? { championId: pick.championId, skinNum: pick.skinNum } : null), [pick]);
  const dirty = JSON.stringify(style) !== JSON.stringify(saved) || banner.kind !== "keep" || pick.championId !== initialPick.championId || pick.skinNum !== initialPick.skinNum || linksChanged;
  const tagProblem = style.identity.tagline ? taglineProblem(style.identity.tagline) : null;

  const set = React.useCallback<Setter>((fn) => setStyle((s) => ({ ...fn(s), preset: s.preset })), []);
  const onPreset = React.useCallback((id: (typeof CARD_PRESETS)[number]) => setStyle((s) => applyPreset(s, id)), []);
  const onChampion = React.useCallback((id: string) => setPick((p) => (p.championId === id ? p : { championId: id, skinNum: 0 })), []);
  const onSkin = React.useCallback((n: number) => setPick((p) => (p.skinNum === n ? p : { ...p, skinNum: n })), []);
  // Escape, the close button and a click outside ask before unsaved changes are lost; Cancel is
  // the explicit discard.
  const canClose = () => busy ? false : !dirty || window.confirm("Discard your changes? The saved card stays as it was.");
  const at = steps.indexOf(step);
  const onLink = React.useCallback((kind: SocialKind, patch: Partial<SocialDraft[SocialKind]>) => {
    setLinks((l) => (l?.kind === "ready" ? { ...l, draft: { ...l.draft, [kind]: { ...l.draft[kind], ...patch } } } : l));
    setError(null);
  }, []);

  const save = async () => {
    if (tagProblem) return setError(tagProblem);
    if (linksProblem) {
      setStep("links");
      return setError(linksProblem);
    }
    setBusy(true);
    setError(null);
    // Your links first: if they are refused, nothing else has changed yet.
    if (links?.kind === "ready" && linksChanged) {
      const r = await saveSocialLinksAction(links.draft);
      if (!r.ok) {
        setBusy(false);
        setStep("links");
        setError(r.error);
        return;
      }
      const next = socialDraftOf(r.data.links);
      setLinks({ kind: "ready", saved: next, draft: next });
    }
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
    const r = await setCardStyleAction(playerId, { featuredChampionId: pick.championId, featuredSkinNum: pick.skinNum, style: finalStyle as unknown as Record<string, unknown> });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success("Card saved.", { description: "It shows on Team, Players, your profile and Leaderboards." });
    onClose();
    router.refresh();
  };

  const header = (
    <div className="flex flex-col gap-2 px-4 pb-2 pt-3 pr-14 sm:px-5 sm:pr-16 lg:flex-row lg:items-center lg:gap-5">
      <div className="min-w-0 shrink-0">
        <h2 id="studio-title" className="text-lg font-semibold leading-tight text-fg">
          Player Card Studio
        </h2>
        <p className="text-xs text-fg-subtle">Nothing changes until you save.</p>
      </div>
      {/* The steps: a guide in order, and a shortcut to any of them. */}
      <ol className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-0.5 lg:mx-auto" aria-label="Studio steps" data-testid="studio-steps">
        {steps.map((id, i) => (
          <li key={id} className="shrink-0">
            <button type="button" onClick={() => setStep(id)} aria-current={step === id ? "step" : undefined} title={STEP_INFO[id].hint} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium transition-colors pointer-coarse:min-h-11", step === id ? "border-accent bg-accent/15 text-fg" : "border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg")} data-testid={`studio-step-${id}`}>
              <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] tabular-nums", step === id ? "bg-accent text-bg" : i < at ? "bg-accent/25 text-accent" : "bg-surface-3 text-fg-subtle")} aria-hidden>
                {i + 1}
              </span>
              {STEP_INFO[id].label}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <DetailModal
      open
      onClose={onClose}
      canClose={canClose}
      title="Player Card Studio"
      titleId="studio-title"
      size="wide"
      header={header}
      headerClassName="border-b border-border"
      bodyClassName="flex flex-col p-0 sm:p-0 lg:overflow-hidden max-lg:[scroll-padding-top:var(--studio-pinned,0px)] short:[scroll-padding-top:0px]"
      testId="card-studio-window"
      footer={
        <>
          {error ? (
            <p role="alert" className="mr-auto self-center text-sm text-bad" data-testid="studio-error">
              {error}
            </p>
          ) : null}
          <Button variant="ghost" onClick={() => setStyle({ ...DEFAULT_CARD_STYLE, identity: { ...DEFAULT_CARD_STYLE.identity, tagline: style.identity.tagline, emblem: style.identity.emblem } })} disabled={busy} className={cn(!error && "mr-auto")} data-testid="studio-reset-all" title="Back to the standard look (your champion, tagline and emblem stay)">
            <RotateCcw className="h-4 w-4" /> Reset look
          </Button>
          <span className="flex items-center gap-1 max-sm:hidden">
            <Button variant="ghost" onClick={() => setStep(steps[at - 1]!)} disabled={at === 0} aria-label="Previous step" data-testid="studio-prev">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button variant="outline" onClick={() => setStep(steps[at + 1]!)} disabled={at === steps.length - 1} aria-label="Next step" data-testid="studio-next">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </span>
          <Button variant="ghost" onClick={onClose} disabled={busy} data-testid="studio-cancel">
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !!tagProblem || links?.kind === "loading"} data-testid="save-card-style">
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      {/* Desktops: the step fits beside the preview, and long lists scroll inside it. Phones and
          tablets: the step takes its own height and the window scrolls, so no list is ever squeezed
          under another. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 max-lg:flex-none lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] short:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" data-testid="card-studio" data-step={step}>
        {/* The live preview: beside the controls on wide screens, pinned above them on phones. A phone
            held sideways has no height to pin it above: it stays beside the controls instead. */}
        <div ref={pinned} className="sticky top-0 z-10 space-y-2 border-b border-border bg-bg-elevated px-4 pb-2 pt-2 lg:static lg:flex lg:flex-col lg:justify-center lg:border-b-0 lg:border-r lg:bg-bg/40 lg:p-5 short:self-start short:border-b-0 short:border-r short:pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-fg-subtle">Preview</span>
            <button type="button" onClick={() => setPreviewShown((v) => !v)} aria-expanded={previewShown} aria-controls="studio-preview-card" className="mr-auto inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:text-fg pointer-coarse:min-h-10 lg:hidden" data-testid="studio-preview-toggle">
              {previewShown ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              {previewShown ? "Hide" : "Show"}
            </button>
            <div role="radiogroup" aria-label="Preview" className={cn("flex rounded-lg border border-border p-0.5", !previewShown && "max-lg:hidden")}>
              {(
                [
                  ["team", Monitor, "Team card"],
                  ["phone", Smartphone, "Phone"],
                  ["directory", LayoutGrid, "Players"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => setView(v)} className={cn("inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs pointer-coarse:min-h-10", view === v ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg")} data-testid={`preview-${v}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden /> <span className="max-sm:sr-only short:sr-only">{label}</span>
                </button>
              ))}
            </div>
          </div>
          {/* On phones and tablets the card is drawn smaller, so the controls keep most of the screen;
              smaller still on a short phone held upright (an iPhone SE), where the note below is left out. */}
          <div id="studio-preview-card" className={cn("max-lg:[zoom:0.72] short:[zoom:0.62] [@media(orientation:portrait)_and_(max-height:700px)]:[zoom:0.6]", !previewShown && "max-lg:hidden")} data-testid="studio-preview-card">
            <CardPreview view={view} look={previewLook} art={previewArt} name={name} avatarUrl={avatarUrl} data={previewData} champions={champions} />
          </div>
          {view !== "directory" && figures !== "loading" && !previewData?.season ? (
            <p className={cn("text-center text-xs text-fg-subtle [@media(orientation:portrait)_and_(max-height:700px)]:hidden", !previewShown && "max-lg:hidden")} data-testid="preview-figures-note">
              No season figures to show yet: the tiles fill in once this season&apos;s games are synced.
            </p>
          ) : null}
        </div>

        {/* The step: one area at a time, laid out to fit beside the preview without scrolling. */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3 px-4 py-4 lg:overflow-y-auto lg:px-6" aria-labelledby="studio-step-title" data-testid={`studio-panel-${step}`}>
          <header className="flex items-baseline justify-between gap-3">
            <h3 id="studio-step-title" className="text-base font-semibold text-fg">
              {STEP_INFO[step].label} <span className="text-sm font-normal text-fg-subtle">· {STEP_INFO[step].hint}</span>
            </h3>
            <span className="shrink-0 text-xs tabular-nums text-fg-subtle">
              Step {at + 1} of {steps.length}
            </span>
          </header>
          {step === "style" ? (
            <div className="space-y-4">
              <Presets style={style} onApply={onPreset} />
              <BackgroundPanel style={style} set={set} bannerUrl={bannerUrl} onBanner={setBanner} hasSavedBanner={!!look?.bannerUrl} />
              <FramePanel style={style} set={set} />
            </div>
          ) : null}
          {step === "artwork" ? (
            style.art.source === "none" ? (
              <p className="text-sm text-fg-muted" data-testid="artwork-none">
                The card shows colours only. Choose <button type="button" className="font-medium text-accent hover:underline" onClick={() => (set((s) => ({ ...s, art: { ...s.art, source: "champion" } })), undefined)}>champion art</button> to pick a champion and skin.
              </p>
            ) : (
              <ArtworkChooser championId={pick.championId} skinNum={pick.skinNum} champions={champions} poolIds={poolIds} onChampion={onChampion} onSkin={onSkin} fallback={style.art.source === "banner"} />
            )
          ) : null}
          {step === "position" ? <ArtworkAdjustPanel style={style} set={set} /> : null}
          {step === "colours" ? <ColoursPanel style={style} set={set} /> : null}
          {step === "identity" ? <IdentityPanel style={style} set={set} problem={tagProblem} /> : null}
          {step === "links" && links ? <LinksPanel state={links} onChange={onLink} /> : null}
          {step === "effects" ? <EffectsPanel style={style} set={set} /> : null}
        </section>
      </div>
    </DetailModal>
  );
}

// ── Preview ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The real card pieces (player-card.tsx) with the player's real role, rank, figures and pool where
 * the opener knows them: what Team, a phone and the Players directory will show. A dash stands in
 * only for what the page that opened the Studio does not load (season figures on the profile).
 */
function Presets({ style, onApply }: { style: CardStyle; onApply: (id: (typeof CARD_PRESETS)[number]) => void }) {
  return (
    <section>
      <h3 className="mb-1.5 text-sm font-medium text-fg">
        Style <span className="text-xs font-normal text-fg-subtle">· a preset is a starting point you can change</span>
      </h3>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible" data-testid="studio-presets">
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
    </section>
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

/**
 * A range input that stays under the finger: the thumb and its number follow the pointer at once
 * (local state), while the card style is updated at most once per frame (requestAnimationFrame),
 * so a fast drag never queues a re-render of the whole Studio for every pixel. A value set from
 * outside (a preset, Reset) replaces the local one.
 */
function Slider({ value, min, max, step = 1, onChange, label, format }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; format?: (v: number) => string }) {
  const [local, setLocal] = React.useState(value);
  const [seen, setSeen] = React.useState(value);
  const [sent, setSent] = React.useState(value);
  if (seen !== value) {
    setSeen(value);
    // Our own update coming back changes nothing; anything else (a preset, Reset) takes over.
    if (value !== sent) setLocal(value);
  }
  const frame = React.useRef<number | null>(null);
  const pending = React.useRef(value);
  const latest = React.useRef(onChange);
  React.useLayoutEffect(() => {
    latest.current = onChange;
  });
  const flush = React.useCallback(() => {
    frame.current = null;
    setSent(pending.current);
    latest.current(pending.current);
  }, []);
  // Leaving the step mid-drag still keeps the last position.
  React.useEffect(
    () => () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        latest.current(pending.current);
      }
    },
    [],
  );
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v);
          pending.current = v;
          if (frame.current === null) frame.current = requestAnimationFrame(flush);
        }}
        aria-label={label}
        className="h-9 min-w-0 flex-1 cursor-pointer accent-[var(--color-accent)] pointer-coarse:h-11"
      />
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-fg-muted">{format ? format(local) : local}</span>
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
          <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} title={c} onClick={() => onChange(c)} className={cn("grid h-7 w-7 place-items-center rounded-full border-2 pointer-coarse:h-10 pointer-coarse:w-10", value === c ? "border-fg" : "border-transparent")} style={{ background: c }}>
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

/** Style step: what is behind the card (champion art, your banner, or colours only). */
function BackgroundPanel({ style, set, bannerUrl, onBanner, hasSavedBanner }: { style: CardStyle; set: Setter; bannerUrl: string | null; onBanner: (b: BannerDraft) => void; hasSavedBanner: boolean }) {
  const [preparing, setPreparing] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
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
      <Field label="Artwork" changed={art.source !== D.art.source} onReset={() => set((s) => ({ ...s, art: { ...s.art, source: D.art.source } }))}>
        <Choice label="Background" value={art.source} options={ART_SOURCES} labels={{ champion: "Champion art", banner: "My banner", none: "Colours only" }} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, source: v } }))} columns={3} />
      </Field>
      {art.source === "banner" ? (
        <div className="space-y-2 rounded-panel border border-border bg-surface p-3" data-testid="banner-panel">
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
    </>
  );
}

/**
 * The Artwork step: the champion and skin behind the card. Kept apart from the style (memoised,
 * stable callbacks), so a colour or a slider never re-renders the champion grid or the skins.
 */
const ArtworkChooser = React.memo(function ArtworkChooser({ championId, skinNum, champions, poolIds, onChampion, onSkin, fallback }: { championId: string | null; skinNum: number; champions: PickerChampion[]; poolIds: string[]; onChampion: (id: string) => void; onSkin: (n: number) => void; fallback: boolean }) {
  const [fetched, setFetched] = React.useState<{ id: string; list: Array<{ num: number; name: string }> } | null>(null);
  const skins = championId ? (skinCache.get(championId) ?? (fetched?.id === championId ? fetched.list : null)) : [];
  const pool = React.useMemo(() => new Set(poolIds), [poolIds]);
  const selected = React.useMemo(() => new Set(championId ? [championId] : []), [championId]);
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
  const skinName = skins?.find((x) => x.num === skinNum)?.name ?? (skinNum === 0 ? "Default" : null);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5" data-testid="artwork-step">
      <section className="flex max-h-[22rem] min-h-0 flex-col gap-1.5 lg:max-h-none" aria-label="Champion">
        <h4 className="text-sm font-medium text-fg">
          Champion <span className="text-xs font-normal text-fg-subtle">· {fallback ? "used when there is no banner" : "your pool first"}</span>
        </h4>
        <ChampionGrid champions={champions} selectedIds={selected} onPick={onChampion} prioritisedIds={pool} prioritisedLabel="in your pools" maxHeight="fill" size="sm" testId="customise-champions" placeholder="Search any champion…" progressive />
      </section>
      {/* The skins get the room: large thumbnails of each distinct illustration. */}
      <section className="flex min-h-0 flex-col gap-1.5" aria-label="Skin">
        <h4 className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium text-fg">
          <span className="shrink-0">Skin</span>
          {champName ? (
            <span className="truncate text-xs font-normal text-fg-subtle">
              · {champName}
              {skinName ? ` · ${skinName}` : ""} · any skin may be shown; it does not mean you own it
            </span>
          ) : null}
        </h4>
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
    </div>
  );
});

/** Colours step: one tap sets both colours. */
function PaletteChooser({ style, set }: { style: CardStyle; set: Setter }) {
  const c = style.colours;
  return (
    <Field label="Colours" hint="one tap sets both; fine-tune them below" changed={c.primary !== D.colours.primary || c.secondary !== D.colours.secondary} onReset={() => set((s) => ({ ...s, colours: { ...s.colours, primary: D.colours.primary, secondary: D.colours.secondary } }))}>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5" data-testid="palettes">
        {CARD_PALETTES.map((p) => {
          const on = c.primary === p.primary && c.secondary === p.secondary;
          return (
            <button key={p.label} type="button" aria-pressed={on} onClick={() => set((s) => ({ ...s, colours: { ...s.colours, primary: p.primary, secondary: p.secondary } }))} className={cn("flex min-h-9 items-center gap-2 rounded-lg border px-2 text-xs font-medium pointer-coarse:min-h-11", on ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted hover:text-fg")}>
              <span className="h-5 w-5 shrink-0 rounded-full" style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)` }} aria-hidden />
              <span className="truncate">{p.label}</span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/** Position step: where the artwork sits and how strongly it is veiled behind the text. */
function ArtworkAdjustPanel({ style, set }: { style: CardStyle; set: Setter }) {
  const art = style.art;
  if (art.source === "none") return <p className="text-sm text-fg-muted">The card shows colours only. Choose champion art or a banner under Style to position artwork.</p>;
  return (
    <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2">
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
  );
}

function ColoursPanel({ style, set }: { style: CardStyle; set: Setter }) {
  const c = style.colours;
  const lifted = readableColour(c.primary) !== c.primary;
  return (
    <div className="grid gap-x-6 gap-y-2.5 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <PaletteChooser style={style} set={set} />
      </div>
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
        <Choice label="Avatar frame" value={c.avatarFrame} options={AVATAR_FRAMES} labels={{ primary: "Primary", secondary: "Secondary", gradient: "Gradient", neutral: "Neutral", none: "None" }} onChange={(v) => set((s) => ({ ...s, colours: { ...s.colours, avatarFrame: v } }))} columns={3} />
      </Field>
    </div>
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
            <button key={f} type="button" role="radio" aria-checked={style.frame === f} onClick={() => set((s) => ({ ...s, frame: f }))} className={cn("rounded-panel border p-1.5 text-left transition-colors", style.frame === f ? "border-accent ring-1 ring-accent" : "border-border hover:border-border-strong")} data-value={f}>
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
    <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2">
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
    </div>
  );
}

/**
 * Your YouTube, Twitch and Discord, each with who may see it: the same links (and the same checks)
 * as Settings → Profile, saved with the card. The preview's icons follow them as you type.
 */
function LinksPanel({ state, onChange }: { state: LinksState; onChange: (kind: SocialKind, patch: Partial<SocialDraft[SocialKind]>) => void }) {
  return (
    <div className="space-y-3" data-testid="studio-links">
      <p className="text-xs text-fg-subtle">Optional. Nothing shows until you choose who can see it. YouTube and Twitch open your channel; Discord shows your username for others to copy, or opens your Discord profile when you paste its address.</p>
      {state.kind === "loading" ? (
        <p className="text-sm text-fg-muted" role="status">
          Loading your links…
        </p>
      ) : state.kind === "failed" ? (
        <p className="text-sm text-bad" role="alert">
          {state.error}
        </p>
      ) : (
        <SocialLinksFields draft={state.draft} onChange={onChange} idPrefix="studio-social" />
      )}
    </div>
  );
}

function EffectsPanel({ style, set }: { style: CardStyle; set: Setter }) {
  const fx = style.effects;
  const any = fx.glow || fx.shimmer || fx.drift || fx.motif !== "none";
  return (
    <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2">
      <p className="text-xs text-fg-subtle lg:col-span-2">Decorative and optional. Animations stop for anyone whose device asks for reduced motion, and small cards leave them out.</p>
      <div className="rounded-panel border border-border bg-surface px-1 py-1 lg:row-span-2">
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
    </div>
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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {skins.length > 6 ? (
        <SearchInput value={query} onChange={setQuery} placeholder={`Search ${skins.length - 1} skins…`} label="Search skins" testId="skin-search" />
      ) : null}
      <ul role="radiogroup" aria-label="Skin artwork" className="grid max-h-80 min-h-0 grid-cols-3 content-start gap-2 overflow-y-auto overscroll-contain pr-1 min-[420px]:grid-cols-4 lg:max-h-none lg:flex-1 lg:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]" data-testid="skin-options">
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
                <span className="block truncate px-1.5 py-1 text-xs text-fg">{s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {q && shown.length <= 1 ? <p className="text-xs text-fg-subtle">No skin matches “{query}”.</p> : null}
    </div>
  );
}
