"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchInput } from "@/components/ui/search-input";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Expand, ImagePlus, LayoutGrid, Monitor, RotateCcw, Smartphone, Trash2 } from "lucide-react";
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
import { ChampionPortrait } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { CLEAR_OF_CONTROLS, DetailModal } from "@/components/ui/detail-modal";
import { useKeyboardFit } from "@/components/ui/keyboard-fit";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { CardFrame, cardShellStyle, EMBLEM_ICONS } from "./card-look";
import type { CardSeason } from "./player-card";
import { prepareBanner } from "./banner-image";
import { CardPreview, type PreviewView, type StudioPreviewData } from "./card-preview";

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
 * directly: from the step bar on a desktop, from the section list on phones and tablets.
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

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The steps whose settings differ from the saved card (marked in the section list). */
function editedSteps(style: CardStyle, saved: CardStyle, other: { artwork: boolean; banner: boolean; links: boolean }): Set<Step> {
  const out = new Set<Step>();
  if (style.preset !== saved.preset || style.art.source !== saved.art.source || style.frame !== saved.frame || other.banner) out.add("style");
  if (other.artwork) out.add("artwork");
  const { source: _s, ...pos } = style.art;
  const { source: _t, ...savedPos } = saved.art;
  if (!same(pos, savedPos)) out.add("position");
  if (!same(style.colours, saved.colours)) out.add("colours");
  if (!same(style.identity, saved.identity)) out.add("identity");
  if (other.links) out.add("links");
  if (!same(style.effects, saved.effects)) out.add("effects");
  return out;
}

/** A media query as React state (false on the server and until mounted). */
function useMedia(query: string): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Where the preview stands beside the controls: desktops, and phones held sideways (no height to spare above them). */
const SIDE_BY_SIDE = "(min-width: 64rem), (max-height: 480px)";
/** Phones and tablets remember whether the preview was put away. */
const PREVIEW_KEY = "uniiverse.studio.preview";

/**
 * While `active` (unsaved changes), going back in the browser (a desktop's Back button, an
 * iPhone's swipe from the edge) asks first instead of leaving: an extra history entry for this
 * same page is added, and going back from it calls `onBack`. Android's back gesture already asks
 * (it is the window's own close request, see canClose). The entry is taken away again when the
 * guard ends (saved, discarded, nothing left to lose), so Back then leaves the page as before.
 */
function useBackGuard(active: boolean, onBack: () => void) {
  const latest = React.useRef(onBack);
  React.useLayoutEffect(() => {
    latest.current = onBack;
  });
  // A Back that only closed something over the Studio puts the entry back (a new round).
  const [round, setRound] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    // The same address and Next.js's own state for it, marked as the Studio's.
    window.history.pushState({ ...window.history.state, studioGuard: true }, "");
    let left = false;
    const onPop = (e: PopStateEvent) => {
      // Landing on a guard entry is the guard being taken away, not someone going back.
      if ((e.state as { studioGuard?: boolean } | null)?.studioGuard) return;
      left = true;
      setRound((r) => r + 1);
      latest.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!left && (window.history.state as { studioGuard?: boolean } | null)?.studioGuard) window.history.back();
    };
  }, [active, round]);
}

/**
 * The Player Card Studio, opened by CustomiseCardButton (customise-card-button.tsx), which loads
 * this module only when it is first wanted. Nothing is saved until Save; Cancel leaves the saved
 * card exactly as it was.
 *
 * Desktops: the step bar in the header, the live preview beside the controls, Back and Next in the
 * footer. Phones and tablets: a compact header, the preview above (compact, put away to a strip, or
 * opened as the full card), one section bar (where you are, previous / next, and the list of all
 * sections), the controls in the one area that scrolls, and the action bar. A phone held sideways
 * keeps the preview beside the controls.
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
  // Which way the last section change went, so the new one slides in from that side.
  const [direction, setDirection] = React.useState<"next" | "prev" | null>(null);
  const [view, setView] = React.useState<PreviewView>("team");
  // Phones and tablets: the preview can be put away to give the controls the screen (remembered).
  const [previewShown, setPreviewShown] = React.useState(() => {
    try {
      return window.localStorage.getItem(PREVIEW_KEY) !== "hidden";
    } catch {
      return true;
    }
  });
  const [fullCard, setFullCard] = React.useState(false);
  const [sectionsOpen, setSectionsOpen] = React.useState(false);
  // A confirmation in the action bar: resetting the whole look, or leaving with unsaved changes.
  const [confirm, setConfirm] = React.useState<"reset" | "discard" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const root = React.useRef<HTMLDivElement>(null);
  const controls = React.useRef<HTMLElement>(null);
  const sideBySide = useMedia(SIDE_BY_SIDE);
  const keyboard = useKeyboardFit(root);

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
  const artworkChanged = pick.championId !== initialPick.championId || pick.skinNum !== initialPick.skinNum;
  const dirty = !same(style, saved) || banner.kind !== "keep" || artworkChanged || linksChanged;
  const edited = React.useMemo(() => editedSteps(style, saved, { artwork: artworkChanged, banner: banner.kind !== "keep", links: !!linksChanged }), [style, saved, artworkChanged, banner.kind, linksChanged]);
  const tagProblem = style.identity.tagline ? taglineProblem(style.identity.tagline) : null;

  const set = React.useCallback<Setter>((fn) => setStyle((s) => ({ ...fn(s), preset: s.preset })), []);
  const onPreset = React.useCallback((id: (typeof CARD_PRESETS)[number]) => setStyle((s) => applyPreset(s, id)), []);
  const onChampion = React.useCallback((id: string) => setPick((p) => (p.championId === id ? p : { championId: id, skinNum: 0 })), []);
  const onSkin = React.useCallback((n: number) => setPick((p) => (p.skinNum === n ? p : { ...p, skinNum: n })), []);
  const onLink = React.useCallback((kind: SocialKind, patch: Partial<SocialDraft[SocialKind]>) => {
    setLinks((l) => (l?.kind === "ready" ? { ...l, draft: { ...l.draft, [kind]: { ...l.draft[kind], ...patch } } } : l));
    setError(null);
  }, []);
  const at = steps.indexOf(step);
  const goTo = React.useCallback(
    (next: Step) => {
      setSectionsOpen(false);
      if (next === step) return;
      setDirection(steps.indexOf(next) > steps.indexOf(step) ? "next" : "prev");
      setStep(next);
      // A new section starts at its top.
      controls.current?.scrollTo({ top: 0 });
    },
    [step, steps],
  );
  const showPreview = (shown: boolean) => {
    setPreviewShown(shown);
    try {
      window.localStorage.setItem(PREVIEW_KEY, shown ? "shown" : "hidden");
    } catch {
      // Private browsing: remembered for this visit only.
    }
  };

  // Escape, the close button and a click outside first close whatever is open over the Studio,
  // then ask before unsaved changes are lost (in the action bar). Cancel asks the same.
  const canClose = () => {
    if (busy) return false;
    if (sectionsOpen) return (setSectionsOpen(false), false);
    if (fullCard) return (setFullCard(false), false);
    if (confirm) return (setConfirm(null), false);
    if (!dirty) return true;
    setConfirm("discard");
    return false;
  };
  const cancel = () => (dirty ? setConfirm("discard") : onClose());
  // Going back in the browser does the same as Escape (see useBackGuard).
  useBackGuard(dirty && !busy && confirm !== "discard", () => void canClose());
  const resetLook = () => {
    setStyle({ ...DEFAULT_CARD_STYLE, identity: { ...DEFAULT_CARD_STYLE.identity, tagline: style.identity.tagline, emblem: style.identity.emblem } });
    setConfirm(null);
  };
  // Leaving the page (reload, closing the tab) with unsaved changes asks the browser's own question.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    if (tagProblem) return setError(tagProblem);
    if (linksProblem) {
      goTo("links");
      return setError(linksProblem);
    }
    setBusy(true);
    setError(null);
    // Your links first: if they are refused, nothing else has changed yet.
    if (links?.kind === "ready" && linksChanged) {
      const r = await saveSocialLinksAction(links.draft);
      if (!r.ok) {
        setBusy(false);
        goTo("links");
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
    <div className={cn("flex flex-col gap-2 py-2.5 pl-4 sm:pl-5 lg:flex-row lg:items-center lg:gap-5 lg:pb-2 lg:pt-3 short:py-1.5", CLEAR_OF_CONTROLS)}>
      <div className="min-w-0 shrink-0 short:flex short:items-baseline short:gap-3">
        <h2 id="studio-title" className="text-base font-semibold leading-tight text-fg sm:text-lg">
          Player Card Studio
        </h2>
        <p className={cn("flex items-center gap-1.5 text-xs", dirty ? "text-warn" : "text-fg-subtle")} data-testid="studio-status">
          {dirty ? <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden /> : null}
          {dirty ? "Unsaved changes" : "Nothing changes until you save."}
        </p>
      </div>
      {/* Desktops: the steps, a guide in order and a shortcut to any of them. */}
      <ol className="hidden min-w-0 gap-1 overflow-x-auto lg:mx-auto lg:flex" aria-label="Studio steps" data-testid="studio-steps">
        {steps.map((id, i) => (
          <li key={id} className="shrink-0">
            <button type="button" onClick={() => goTo(id)} aria-current={step === id ? "step" : undefined} title={STEP_INFO[id].hint} className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium transition-colors", step === id ? "border-accent bg-accent/15 text-fg" : "border-transparent text-fg-muted hover:bg-surface-2 hover:text-fg")} data-testid={`studio-step-${id}`}>
              <span className={cn("grid h-5 w-5 place-items-center rounded-full text-2xs tabular-nums", step === id ? "bg-accent text-bg" : i < at ? "bg-accent/25 text-accent" : "bg-surface-3 text-fg-subtle")} aria-hidden>
                {i + 1}
              </span>
              {STEP_INFO[id].label}
              {edited.has(id) && step !== id ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Changed" aria-hidden />
                  <span className="sr-only"> (changed)</span>
                </>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );

  const footer = confirm ? (
    <ConfirmBar kind={confirm} onKeep={() => setConfirm(null)} onConfirm={confirm === "reset" ? resetLook : onClose} />
  ) : (
    <>
      {error ? (
        <p role="alert" className="w-full text-sm text-bad" data-testid="studio-error">
          {error}
        </p>
      ) : null}
      <Button variant="ghost" onClick={() => setConfirm("reset")} disabled={busy} className="mr-auto px-2.5" data-testid="studio-reset-all" title="Back to the standard look (your champion, tagline and emblem stay)">
        <RotateCcw className="h-4 w-4" aria-hidden /> <span className="max-[359px]:sr-only">Reset look</span>
      </Button>
      <span className="hidden items-center gap-1 lg:flex">
        <Button variant="ghost" onClick={() => goTo(steps[at - 1]!)} disabled={at === 0} aria-label="Previous step" data-testid="studio-prev">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="outline" onClick={() => goTo(steps[at + 1]!)} disabled={at === steps.length - 1} aria-label="Next step" data-testid="studio-next">
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </span>
      <Button variant="ghost" onClick={cancel} disabled={busy} data-testid="studio-cancel">
        Cancel
      </Button>
      <Button variant="primary" onClick={save} disabled={busy || !!tagProblem || links?.kind === "loading"} className="min-w-24" data-testid="save-card-style">
        {busy ? "Saving…" : "Save"}
      </Button>
    </>
  );

  const card = (opts: { full?: boolean } = {}) => <CardPreview view={view} look={previewLook} art={previewArt} name={name} avatarUrl={avatarUrl} data={previewData} champions={champions} full={opts.full} />;
  const figuresNote = view !== "directory" && figures !== "loading" && !previewData?.season;
  // Phones and tablets upright: the preview compact above the controls, or put away to a strip
  // (also while the keyboard is up, so the field and Save keep the room).
  const strip = !sideBySide && (!previewShown || keyboard);

  return (
    <DetailModal open onClose={onClose} canClose={canClose} title="Player Card Studio" titleId="studio-title" size="wide" header={header} headerClassName="border-b border-border" innerScroll testId="card-studio-window" footer={footer}>
      <div
        ref={root}
        className="relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] short:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] short:grid-rows-[minmax(0,1fr)]"
        data-testid="card-studio"
        data-step={step}
        data-keyboard={keyboard || undefined}
      >
        {/* The live preview: beside the controls on desktops and on a phone held sideways, above them otherwise. */}
        <div className={cn("min-w-0 border-b border-border bg-bg/40 lg:flex lg:flex-col lg:justify-center lg:gap-2 lg:border-b-0 lg:border-r lg:p-5 short:flex short:flex-col short:justify-center short:gap-2 short:overflow-y-auto short:border-b-0 short:border-r short:p-3", strip ? "px-3 py-2" : "space-y-2 px-3 pb-2.5 pt-2 lg:space-y-0 short:space-y-0")} data-testid="studio-preview-pane" data-shown={!strip}>
          {strip ? (
            <PreviewStrip view={view} onShow={() => showPreview(true)} onFull={() => setFullCard(true)} keyboard={keyboard}>
              {card()}
            </PreviewStrip>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-fg-subtle max-lg:sr-only short:sr-only">Preview</span>
                <ViewSwitch view={view} onView={setView} />
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => setFullCard(true)} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg pointer-coarse:min-h-10 lg:hidden" data-testid="studio-full-card-open">
                    <Expand className="h-3.5 w-3.5" aria-hidden /> Full card
                  </button>
                  <button type="button" onClick={() => showPreview(false)} aria-expanded="true" aria-controls="studio-preview-card" className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg pointer-coarse:min-h-10 lg:hidden short:hidden" data-testid="studio-preview-toggle">
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden /> Hide
                  </button>
                </span>
              </div>
              {/* Phones and tablets: the card drawn smaller (one scale for every view), its foot faded
                  where a taller view is cut; Full card shows all of it. */}
              <div id="studio-preview-card" className={cn("relative max-lg:max-h-[8.5rem] max-lg:overflow-hidden short:max-h-none", view !== "team" && "max-lg:[mask-image:linear-gradient(to_bottom,black_75%,transparent)] short:[mask-image:none]")} data-testid="studio-preview-card">
                <div className="max-lg:[zoom:0.72] [@media(orientation:portrait)_and_(max-height:700px)]:[zoom:0.6] short:[zoom:0.62]">{card()}</div>
              </div>
              {figuresNote ? (
                <p className="text-center text-xs text-fg-subtle max-lg:hidden" data-testid="preview-figures-note">
                  No season figures to show yet: the tiles fill in once this season&apos;s games are synced.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-col">
          <SectionBar steps={steps} step={step} edited={edited} open={sectionsOpen} onOpen={setSectionsOpen} onStep={goTo} />
          {/* The step: one area at a time, and the only part of the Studio that scrolls. */}
          <section ref={controls} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4 lg:flex lg:flex-col lg:px-6 lg:pb-4" aria-label={`${STEP_INFO[step].label}: ${STEP_INFO[step].hint}`} data-testid={`studio-panel-${step}`}>
            <header className="mb-3 hidden shrink-0 items-baseline justify-between gap-3 lg:flex">
              <h3 className="text-base font-semibold text-fg">
                {STEP_INFO[step].label} <span className="text-sm font-normal text-fg-subtle">· {STEP_INFO[step].hint}</span>
              </h3>
              <span className="shrink-0 text-xs tabular-nums text-fg-subtle">
                Step {at + 1} of {steps.length}
              </span>
            </header>
            <div key={step} className={cn("space-y-5 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:space-y-4", direction === "next" ? "motion-safe:step-in-next" : direction === "prev" ? "motion-safe:step-in-prev" : null)}>
              {step === "style" ? (
                <>
                  <Presets style={style} onApply={onPreset} />
                  <BackgroundPanel style={style} set={set} bannerUrl={bannerUrl} onBanner={setBanner} hasSavedBanner={!!look?.bannerUrl} />
                  <FramePanel style={style} set={set} />
                </>
              ) : null}
              {step === "artwork" ? (
                style.art.source === "none" ? (
                  <p className="text-sm text-fg-muted" data-testid="artwork-none">
                    The card shows colours only. Choose{" "}
                    <button type="button" className="font-medium text-accent hover:underline" onClick={() => (set((s) => ({ ...s, art: { ...s.art, source: "champion" } })), undefined)}>
                      champion art
                    </button>{" "}
                    to pick a champion and skin.
                  </p>
                ) : (
                  <ArtworkChooser championId={pick.championId} skinNum={pick.skinNum} champions={champions} poolIds={poolIds} onChampion={onChampion} onSkin={onSkin} fallback={style.art.source === "banner"} />
                )
              ) : null}
              {step === "position" ? <ArtworkAdjustPanel style={style} set={set} /> : null}
              {step === "colours" ? <ColoursPanel style={style} set={set} /> : null}
              {step === "identity" ? <IdentityPanel style={style} set={set} problem={tagProblem} /> : null}
              {step === "links" && links ? <LinksPanel state={links} onChange={onLink} /> : null}
              {step === "effects" ? <EffectsPanel style={style} set={set} onColours={() => goTo("colours")} /> : null}
            </div>
          </section>
        </div>

        {fullCard ? (
          <FullCard view={view} onView={setView} onClose={() => setFullCard(false)} note={figuresNote}>
            {card({ full: true })}
          </FullCard>
        ) : null}
      </div>
    </DetailModal>
  );
}

// ── Navigation, preview and confirmations ───────────────────────────────────────────────────────

/**
 * Phones and tablets: the section you are in (number, name and what it holds), previous and next
 * beside it, and the list of every section one tap away, with the ones you changed marked.
 */
function SectionBar({ steps, step, edited, open, onOpen, onStep }: { steps: readonly Step[]; step: Step; edited: ReadonlySet<Step>; open: boolean; onOpen: (open: boolean) => void; onStep: (step: Step) => void }) {
  const at = steps.indexOf(step);
  const listId = React.useId();
  const toggle = React.useRef<HTMLButtonElement>(null);
  const list = React.useRef<HTMLOListElement>(null);
  const prev = steps[at - 1];
  const next = steps[at + 1];
  // Opening moves to the section you are in; closing returns to the bar.
  const wasOpen = React.useRef(open);
  React.useEffect(() => {
    if (open) list.current?.querySelector<HTMLButtonElement>("[aria-current=step]")?.focus();
    else if (wasOpen.current && list.current === null) toggle.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  const arrow = "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="relative shrink-0 border-b border-border bg-bg-elevated lg:hidden" data-testid="studio-section-bar">
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button type="button" onClick={() => prev && onStep(prev)} disabled={!prev} aria-label={prev ? `Previous section: ${STEP_INFO[prev].label}` : "Previous section"} className={arrow} data-testid="studio-section-prev">
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <button
          ref={toggle}
          type="button"
          onClick={() => onOpen(!open)}
          aria-expanded={open}
          aria-controls={listId}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-surface-2"
          data-testid="studio-section-toggle"
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-2xs font-bold tabular-nums text-bg" aria-hidden>
            {at + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight text-fg">
              {STEP_INFO[step].label}
              <span className="sr-only">
                {" "}
                · section {at + 1} of {steps.length}
              </span>
            </span>
            <span className="block truncate text-xs leading-tight text-fg-subtle">{STEP_INFO[step].hint}</span>
          </span>
          <span className="shrink-0 text-xs tabular-nums text-fg-subtle" aria-hidden>
            {at + 1}/{steps.length}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-fg-muted transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        </button>
        <button type="button" onClick={() => next && onStep(next)} disabled={!next} aria-label={next ? `Next section: ${STEP_INFO[next].label}` : "Next section"} className={arrow} data-testid="studio-section-next">
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
      {open ? (
        <>
          {/* A tap anywhere else puts the list away. */}
          <div className="fixed inset-0 z-20" onClick={() => onOpen(false)} aria-hidden />
          <nav
            aria-label="Studio sections"
            className="absolute inset-x-2 top-full z-30 mt-1 max-h-[min(26rem,60dvh)] overflow-y-auto overscroll-contain rounded-panel border border-border-strong bg-bg-elevated p-1 shadow-2xl shadow-black/50 motion-safe:rise-in"
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              // Escape closes the list, not the Studio.
              e.preventDefault();
              e.stopPropagation();
              onOpen(false);
            }}
            data-testid="studio-sections"
          >
            <ol ref={list} id={listId} className="grid gap-0.5">
              {steps.map((id, i) => {
                const here = id === step;
                return (
                  <li key={id}>
                    <button type="button" onClick={() => onStep(id)} aria-current={here ? "step" : undefined} className={cn("flex min-h-12 w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors", here ? "bg-accent/12 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg")} data-testid={`studio-section-${id}`}>
                      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-bold tabular-nums", here ? "bg-accent text-bg" : "bg-surface-3 text-fg-subtle")} aria-hidden>
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-tight text-fg">{STEP_INFO[id].label}</span>
                        <span className="block truncate text-xs leading-tight text-fg-subtle">{STEP_INFO[id].hint}</span>
                      </span>
                      {edited.has(id) ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-2xs font-medium text-warn">
                          <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden /> Changed
                        </span>
                      ) : null}
                      {here ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </>
      ) : null}
    </div>
  );
}

const VIEWS = [
  ["team", Monitor, "Team card"],
  ["phone", Smartphone, "Phone"],
  ["directory", LayoutGrid, "Players"],
] as const;

/** Which card the preview shows: the Team card, a phone's, or the Players directory's. */
function ViewSwitch({ view, onView, labels = false, testIdPrefix = "preview" }: { view: PreviewView; onView: (v: PreviewView) => void; /** Always name each view (otherwise icons only on phones). */ labels?: boolean; testIdPrefix?: string }) {
  return (
    <div role="radiogroup" aria-label="Preview" className="flex rounded-lg border border-border bg-bg/40 p-0.5">
      {VIEWS.map(([v, Icon, label]) => (
        <button key={v} type="button" role="radio" aria-checked={view === v} onClick={() => onView(v)} title={label} className={cn("inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs transition-colors pointer-coarse:min-h-10 pointer-coarse:px-2.5", view === v ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg")} data-testid={`${testIdPrefix}-${v}`}>
          <Icon className="h-3.5 w-3.5" aria-hidden /> <span className={labels ? undefined : "max-sm:sr-only short:sr-only"}>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** The preview put away: a small live thumbnail (it still follows every change), Full card and Show. */
function PreviewStrip({ view, onShow, onFull, keyboard, children }: { view: PreviewView; onShow: () => void; onFull: () => void; keyboard: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3" data-testid="studio-preview-strip">
      <span className="relative h-11 w-[6.5rem] shrink-0 overflow-hidden rounded-md ring-1 ring-border" aria-hidden>
        <span className="pointer-events-none absolute left-0 top-0 block w-[24rem] [zoom:0.27]">{children}</span>
      </span>
      <span className="min-w-0 flex-1 text-xs leading-tight text-fg-muted">
        <span className="block font-medium text-fg">Preview</span>
        <span className="block truncate">{VIEWS.find(([v]) => v === view)![2]}{keyboard ? " · while you type" : ""}</span>
      </span>
      <button type="button" onClick={onFull} className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg" data-testid="studio-full-card-open">
        <Expand className="h-3.5 w-3.5" aria-hidden /> Full card
      </button>
      {keyboard ? null : (
        <button type="button" onClick={onShow} aria-expanded="false" className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-xs text-fg-muted hover:bg-surface-2 hover:text-fg" data-testid="studio-preview-toggle">
          <ChevronDown className="h-3.5 w-3.5" aria-hidden /> Show
        </button>
      )}
    </div>
  );
}

/** The whole card at its real size, over the controls (the action bar stays): any view, then Done. */
function FullCard({ view, onView, onClose, note, children }: { view: PreviewView; onView: (v: PreviewView) => void; onClose: () => void; note: boolean; children: React.ReactNode }) {
  return (
    <div
      role="region"
      aria-label="Full card preview"
      className="absolute inset-0 z-40 flex flex-col bg-bg-elevated motion-safe:fade-in"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      data-testid="studio-full-card"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <ViewSwitch view={view} onView={onView} labels testIdPrefix="full-preview" />
        <Button size="sm" variant="primary" className="ml-auto" onClick={onClose} autoFocus data-testid="studio-full-card-close">
          Done
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {children}
        {note ? <p className="mt-3 text-center text-xs text-fg-subtle">No season figures to show yet: the tiles fill in once this season&apos;s games are synced.</p> : null}
      </div>
    </div>
  );
}

/** A question in the action bar before something is lost: resetting the whole look, or leaving with changes. */
function ConfirmBar({ kind, onKeep, onConfirm }: { kind: "reset" | "discard"; onKeep: () => void; onConfirm: () => void }) {
  const id = React.useId();
  const text =
    kind === "reset"
      ? { title: "Reset the whole look?", detail: "Your champion, tagline and emblem stay; nothing is saved until Save.", keep: "Keep", yes: "Reset look" }
      : { title: "Discard your changes?", detail: "The saved card stays as it was.", keep: "Keep editing", yes: "Discard" };
  return (
    <div role="alertdialog" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 motion-safe:fade-in" data-testid={`studio-confirm-${kind}`}>
      <p className="min-w-0 flex-[1_1_14rem] text-sm leading-snug">
        <span id={`${id}-t`} className="font-semibold text-fg">
          {text.title}
        </span>{" "}
        <span id={`${id}-d`} className="text-fg-muted">
          {text.detail}
        </span>
      </p>
      <span className="ml-auto flex shrink-0 gap-2">
        <Button variant="ghost" onClick={onKeep} autoFocus data-testid="studio-confirm-keep">
          {text.keep}
        </Button>
        <Button variant="danger" onClick={onConfirm} data-testid="studio-confirm-yes">
          {text.yes}
        </Button>
      </span>
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────────────────────────

/** A preset: a starting point every setting can still change. Wrapped on phones, never scrolled sideways. */
function Presets({ style, onApply }: { style: CardStyle; onApply: (id: (typeof CARD_PRESETS)[number]) => void }) {
  return (
    <section>
      <h4 className="mb-2 text-sm font-medium text-fg">
        Style <span className="text-xs font-normal text-fg-subtle">· a preset is a starting point you can change</span>
      </h4>
      <div className="flex flex-wrap gap-1.5" data-testid="studio-presets">
        {CARD_PRESETS.map((id) => {
          const p = PRESET_INFO[id];
          const on = style.preset === id;
          return (
            <button key={id} type="button" onClick={() => onApply(id)} aria-pressed={on} title={p.description} className={cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:min-h-11", on ? "border-accent bg-accent/15 text-fg ring-1 ring-accent" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")} data-testid={`preset-${id}`}>
              <span className="h-3.5 w-3.5 rounded-full" style={{ background: `linear-gradient(135deg, ${p.look.colours.primary}, ${p.look.colours.secondary})` }} aria-hidden />
              {p.label}
              {on ? <Check className="h-3.5 w-3.5 text-accent" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

type Setter = (fn: (s: CardStyle) => CardStyle) => void;

/** A labelled setting with a reset-to-standard button when it differs from the standard card. */
function Field({ label, hint, changed, onReset, children, testId }: { label: string; hint?: string; changed: boolean; onReset: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="min-w-0 text-sm font-medium text-fg">
          {label}
          {hint ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">{hint}</span> : null}
        </span>
        {changed ? (
          <button type="button" onClick={onReset} className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg pointer-coarse:min-h-10" aria-label={`Reset ${label}`} data-testid="reset-setting">
            <RotateCcw className="h-3 w-3" aria-hidden /> Reset
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** A small group of related settings under one quiet heading (phones read them as one block). */
function Group({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <h4 className="text-2xs font-semibold uppercase tracking-label text-fg-subtle lg:hidden">{title}</h4>
      {children}
    </section>
  );
}

function Choice<T extends string>({ value, options, labels, onChange, label, columns = 4 }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void; label: string; columns?: number }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-1.5", columns === 5 ? "grid-cols-3 sm:grid-cols-5" : columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={cn("min-h-9 truncate rounded-lg border px-2 text-xs font-medium transition-colors pointer-coarse:min-h-11", value === o ? "border-accent bg-accent/15 text-fg ring-1 ring-accent" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")} data-value={o}>
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
 * outside (a preset, Reset) replaces the local one. The track fills up to the thumb.
 */
function Slider({ value, min, max, step = 1, onChange, label, format, disabled = false }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; format?: (v: number) => string; disabled?: boolean }) {
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
  const fill = `${Math.round(((local - min) / (max - min)) * 1000) / 10}%`;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocal(v);
          pending.current = v;
          if (frame.current === null) frame.current = requestAnimationFrame(flush);
        }}
        aria-label={label}
        aria-valuetext={format ? format(local) : undefined}
        className="studio-range h-9 min-w-0 flex-1 cursor-pointer disabled:cursor-not-allowed pointer-coarse:h-11"
        style={{ ["--fill" as string]: fill }}
      />
      <output className={cn("min-w-[3.25rem] shrink-0 rounded-md bg-surface-2 px-1.5 py-1 text-center text-xs font-semibold tabular-nums text-fg", disabled && "opacity-50")} aria-hidden>
        {format ? format(local) : local}
      </output>
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
    <div className="space-y-2.5">
      <div role="radiogroup" aria-label={label} className="grid grid-cols-7 gap-1.5 sm:flex sm:flex-wrap">
        {swatches.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={c} title={c} onClick={() => onChange(c)} className={cn("grid aspect-square w-full place-items-center rounded-full transition-[box-shadow] sm:h-7 sm:w-7 pointer-coarse:sm:h-10 pointer-coarse:sm:w-10", value === c ? "ring-2 ring-fg ring-offset-2 ring-offset-bg-elevated" : "ring-1 ring-inset ring-black/20")} style={{ background: c }}>
            {value === c ? <Check className="h-4 w-4 drop-shadow" style={{ color: readableOn(c) }} aria-hidden /> : null}
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
          autoCapitalize="none"
          enterKeyHint="done"
          aria-label={`${label}: hex value`}
          className="h-9 w-28 rounded-lg border border-border bg-bg-elevated px-2.5 font-mono text-base text-fg sm:text-sm pointer-coarse:h-11"
        />
      </div>
    </div>
  );
}

/** Black or white, whichever reads on a swatch (for its check mark). */
function readableOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#0b1020" : "#ffffff";
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
    <div className="space-y-3">
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
    </div>
  );
}

/**
 * The Artwork step: the champion and skin behind the card. Kept apart from the style (memoised,
 * stable callbacks), so a colour or a slider never re-renders the champion grid or the skins.
 * Desktops show the champion grid beside the skins; phones and tablets show the chosen champion
 * with Change (the grid opens in place, in the step's own scrolling, never a list inside a list).
 */
const ArtworkChooser = React.memo(function ArtworkChooser({ championId, skinNum, champions, poolIds, onChampion, onSkin, fallback }: { championId: string | null; skinNum: number; champions: PickerChampion[]; poolIds: string[]; onChampion: (id: string) => void; onSkin: (n: number) => void; fallback: boolean }) {
  const [fetched, setFetched] = React.useState<{ id: string; list: Array<{ num: number; name: string }> } | null>(null);
  // Phones and tablets: the champion grid is open (always on desktops). Open at first when none is chosen.
  const [choosing, setChoosing] = React.useState(!championId);
  const skins = championId ? (skinCache.get(championId) ?? (fetched?.id === championId ? fetched.list : null)) : [];
  const pool = React.useMemo(() => new Set(poolIds), [poolIds]);
  const selected = React.useMemo(() => new Set(championId ? [championId] : []), [championId]);
  const champion = champions.find((c) => c.id === championId);
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
    <div className="flex min-h-0 flex-1 flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5" data-testid="artwork-step">
      <section className="flex min-h-0 flex-col gap-2" aria-label="Champion">
        <h4 className="text-sm font-medium text-fg">
          Champion <span className="text-xs font-normal text-fg-subtle">· {fallback ? "used when there is no banner" : "your pool first"}</span>
        </h4>
        {/* Phones and tablets: the chosen champion, and Change to open the grid. */}
        {champion && !choosing ? (
          <div className="flex items-center gap-3 rounded-panel border border-border bg-surface px-3 py-2 lg:hidden" data-testid="artwork-champion">
            <ChampionPortrait champion={champion} size="md" className="rounded-lg ring-1 ring-accent" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{champion.name}</span>
              <span className="block truncate text-xs text-fg-subtle">{skinName ?? "Default"}</span>
            </span>
            <Button size="sm" variant="outline" onClick={() => setChoosing(true)} aria-expanded="false" data-testid="artwork-change-champion">
              Change
            </Button>
          </div>
        ) : null}
        <div className={cn("min-h-0 flex-col gap-2 lg:flex lg:flex-1", choosing || !champion ? "flex" : "hidden")}>
          <ChampionGrid
            champions={champions}
            selectedIds={selected}
            onPick={(id) => {
              onChampion(id);
              setChoosing(false);
            }}
            prioritisedIds={pool}
            prioritisedLabel="in your pools"
            maxHeight="fill"
            size="sm"
            testId="customise-champions"
            placeholder="Search any champion…"
            progressive
          />
          {champion && choosing ? (
            <Button size="sm" variant="ghost" className="self-start lg:hidden" onClick={() => setChoosing(false)} data-testid="artwork-keep-champion">
              Keep {champion.name}
            </Button>
          ) : null}
        </div>
      </section>
      {/* The skins get the room: large thumbnails of each distinct illustration. */}
      <section className="flex min-h-0 flex-col gap-2" aria-label="Skin">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <h4 className="shrink-0 text-sm font-medium text-fg">Skin</h4>
          {skinName ? <span className="truncate text-xs text-fg-muted" data-testid="artwork-skin-name">{skinName}</span> : null}
        </div>
        {!championId ? (
          <p className="text-sm text-fg-subtle">Choose a champion first.</p>
        ) : skins === null ? (
          <p className="text-sm text-fg-subtle" aria-live="polite">
            Loading skins…
          </p>
        ) : (
          <SkinChooser key={championId} championId={championId} skins={skins} value={skinNum} onChange={onSkin} />
        )}
        <p className="text-xs text-fg-subtle">Any skin may be shown; it does not mean you own it.</p>
      </section>
    </div>
  );
});

/** Colours step: one tap sets both colours. */
function PaletteChooser({ style, set }: { style: CardStyle; set: Setter }) {
  const c = style.colours;
  return (
    <Field label="Palette" hint="one tap sets both colours" changed={c.primary !== D.colours.primary || c.secondary !== D.colours.secondary} onReset={() => set((s) => ({ ...s, colours: { ...s.colours, primary: D.colours.primary, secondary: D.colours.secondary } }))}>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5" data-testid="palettes">
        {CARD_PALETTES.map((p) => {
          const on = c.primary === p.primary && c.secondary === p.secondary;
          return (
            <button key={p.label} type="button" aria-pressed={on} onClick={() => set((s) => ({ ...s, colours: { ...s.colours, primary: p.primary, secondary: p.secondary } }))} className={cn("flex min-h-10 items-center gap-2 rounded-lg border px-2 text-xs font-medium transition-colors pointer-coarse:min-h-11", on ? "border-accent bg-accent/12 text-fg ring-1 ring-accent" : "border-border text-fg-muted hover:text-fg")}>
              <span className="h-5 w-5 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)` }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-left">{p.label}</span>
              {on ? <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/** Position step: where the artwork sits, and how strongly it is veiled behind the text. */
function ArtworkAdjustPanel({ style, set }: { style: CardStyle; set: Setter }) {
  const art = style.art;
  if (art.source === "none") return <p className="text-sm text-fg-muted">The card shows colours only. Choose champion art or a banner under Style to position artwork.</p>;
  return (
    <div className="grid gap-x-6 gap-y-6 lg:grid-cols-2">
      <Group title="Framing">
        <Field label="Horizontal focus" hint={art.focusX === null ? "automatic" : undefined} changed={art.focusX !== null} onReset={() => set((s) => ({ ...s, art: { ...s.art, focusX: null } }))} testId="field-focus-x">
          <Slider label="Horizontal focus" value={art.focusX ?? 50} min={0} max={100} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, focusX: v } }))} format={(v) => `${v}%`} />
        </Field>
        <Field label="Vertical focus" hint={art.focusY === null ? "automatic" : undefined} changed={art.focusY !== null} onReset={() => set((s) => ({ ...s, art: { ...s.art, focusY: null } }))} testId="field-focus-y">
          <Slider label="Vertical focus" value={art.focusY ?? 20} min={0} max={100} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, focusY: v } }))} format={(v) => `${v}%`} />
        </Field>
        <Field label="Zoom" changed={art.zoom !== D.art.zoom} onReset={() => set((s) => ({ ...s, art: { ...s.art, zoom: D.art.zoom } }))} testId="field-zoom">
          <Slider label="Zoom" value={art.zoom} min={1} max={2} step={0.05} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, zoom: v } }))} format={(v) => `${Math.round(v * 100)}%`} />
        </Field>
      </Group>
      <Group title="Readability">
        <Field label="Background darkness" hint="keeps text readable" changed={art.darkness !== D.art.darkness} onReset={() => set((s) => ({ ...s, art: { ...s.art, darkness: D.art.darkness } }))} testId="field-darkness">
          <Slider label="Background darkness" value={art.darkness} min={25} max={90} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, darkness: v } }))} format={(v) => `${v}%`} />
        </Field>
        <Field label="Background blur" changed={art.blur !== D.art.blur} onReset={() => set((s) => ({ ...s, art: { ...s.art, blur: D.art.blur } }))} testId="field-blur">
          <Slider label="Background blur" value={art.blur} min={0} max={12} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, blur: v } }))} format={(v) => `${v}px`} />
        </Field>
        <Field label="Vignette" changed={art.vignette !== D.art.vignette} onReset={() => set((s) => ({ ...s, art: { ...s.art, vignette: D.art.vignette } }))} testId="field-vignette">
          <Slider label="Vignette" value={art.vignette} min={0} max={80} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, vignette: v } }))} format={(v) => `${v}%`} />
        </Field>
      </Group>
    </div>
  );
}

function ColoursPanel({ style, set }: { style: CardStyle; set: Setter }) {
  const c = style.colours;
  const lifted = readableColour(c.primary) !== c.primary;
  return (
    <div className="grid gap-x-6 gap-y-6 lg:grid-cols-2 lg:gap-y-4">
      <div className="lg:col-span-2">
        <PaletteChooser style={style} set={set} />
      </div>
      <Group title="Your colours" className="lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:space-y-0">
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
      </Group>
      <Group title="Wash, border and frame" className="lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-2.5 lg:space-y-0">
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
      </Group>
    </div>
  );
}

const FRAME_LABEL: Record<CardStyle["frame"], string> = { none: "No frame", minimal: "Minimal", outline: "Clean outline", double: "Double line", angular: "Angular", glow: "Soft glow", premium: "Premium" };

function FramePanel({ style, set }: { style: CardStyle; set: Setter }) {
  return (
    <Field label="Card frame" hint="drawn inside the card: sizes never change" changed={style.frame !== D.frame} onReset={() => set((s) => ({ ...s, frame: D.frame }))}>
      <div role="radiogroup" aria-label="Card frame" className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-3 sm:grid-cols-4" data-testid="frame-options">
        {CARD_FRAMES.map((f) => {
          const look: CardLook = { style: { ...style, frame: f, effects: { ...style.effects, glow: false } }, bannerUrl: null };
          const on = style.frame === f;
          return (
            <button key={f} type="button" role="radio" aria-checked={on} onClick={() => set((s) => ({ ...s, frame: f }))} className={cn("relative rounded-panel border p-1.5 text-left transition-colors", on ? "border-accent bg-accent/10 ring-1 ring-accent" : "border-border hover:border-border-strong")} data-value={f}>
              <span className="relative block h-11 overflow-hidden rounded-lg border sm:h-14" style={cardShellStyle(look, { glow: false })}>
                <CardFrame look={look} />
                <span className="absolute inset-x-3 bottom-2 h-1.5 rounded-full" style={{ background: "var(--card-accent)" }} />
              </span>
              <span className="mt-1 flex items-center gap-1 px-0.5">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">{FRAME_LABEL[f]}</span>
                {on ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden /> : null}
              </span>
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
    <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2 lg:gap-y-3">
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
          enterKeyHint="done"
          className="h-11 w-full rounded-lg border border-border bg-bg-elevated px-3 text-base text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none sm:h-10 sm:text-sm pointer-coarse:h-11"
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
          <button type="button" role="radio" aria-checked={id.emblem === null} onClick={() => set((s) => ({ ...s, identity: { ...s.identity, emblem: null } }))} className={cn("grid h-10 place-items-center rounded-lg border text-xs text-fg-muted pointer-coarse:h-11", id.emblem === null ? "border-accent bg-accent/15 text-fg ring-1 ring-accent" : "border-border")}>
            None
          </button>
          {CARD_EMBLEMS.map((e) => {
            const Icon = EMBLEM_ICONS[e];
            return (
              <button key={e} type="button" role="radio" aria-checked={id.emblem === e} aria-label={e} title={e} onClick={() => set((s) => ({ ...s, identity: { ...s.identity, emblem: e } }))} className={cn("grid h-10 place-items-center rounded-lg border pointer-coarse:h-11", id.emblem === e ? "border-accent bg-accent/15 text-accent ring-1 ring-accent" : "border-border text-fg-muted hover:text-fg")} data-value={e}>
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

function EffectsPanel({ style, set, onColours }: { style: CardStyle; set: Setter; /** Opens the Colours step (a colour wash is chosen there). */ onColours: () => void }) {
  const fx = style.effects;
  const any = fx.glow || fx.shimmer || fx.drift || fx.motif !== "none";
  const noWash = style.colours.gradient === "none";
  return (
    <div className="grid gap-x-6 gap-y-5 lg:grid-cols-2 lg:gap-y-3">
      <p className="text-xs text-fg-subtle lg:col-span-2">Decorative and optional. Animations stop for anyone whose device asks for reduced motion, and small cards leave them out.</p>
      <div className="rounded-panel border border-border bg-surface px-1 py-1 lg:row-span-2">
        <Switch id="fx-glow" label="Ambient glow" description="A soft light around the card in your primary colour." checked={fx.glow} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, glow: v } }))} />
        <Switch id="fx-shimmer" label="Accent shimmer" description="A slow sheen across the artwork (animated)." checked={fx.shimmer} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, shimmer: v } }))} />
        <Switch id="fx-drift" label="Moving colour wash" description={noWash ? "Needs a colour wash, chosen under Colours." : "The colour wash drifts gently (animated)."} disabled={noWash} checked={fx.drift && !noWash} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, drift: v } }))} />
        {noWash ? (
          <button type="button" onClick={onColours} className="mb-1 ml-14 inline-flex min-h-9 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-accent hover:underline pointer-coarse:min-h-10" data-testid="effects-go-colours">
            Choose a colour wash <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <Field label="Motif" changed={fx.motif !== D.effects.motif} onReset={() => set((s) => ({ ...s, effects: { ...s.effects, motif: D.effects.motif } }))}>
        <Choice label="Motif" value={fx.motif} options={CARD_MOTIFS} labels={{ none: "None", corners: "Corners", lines: "Lines", dots: "Dots", rings: "Rings" }} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, motif: v } }))} columns={5} />
      </Field>
      <Field label="Intensity" hint={any ? "of the effects above" : "turn an effect on to use it"} changed={fx.intensity !== D.effects.intensity} onReset={() => set((s) => ({ ...s, effects: { ...s.effects, intensity: D.effects.intensity } }))} testId="field-intensity">
        <Slider label="Effect intensity" value={fx.intensity} min={0} max={100} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, intensity: v } }))} format={(v) => `${v}%`} disabled={!any} />
      </Field>
    </div>
  );
}

/**
 * The artwork choice: one thumbnail per distinct illustration (chromas and duplicate images are
 * left out on the server), default first, searchable by name. A thumbnail whose image cannot load
 * removes its whole option rather than leaving a blank card. Phones: part of the step's own
 * scrolling (no list inside a list); desktops: the list fills the space beside the champions.
 */
function SkinChooser({ championId, skins, value, onChange }: { championId: string; skins: Array<{ num: number; name: string }>; value: number; onChange: (num: number) => void }) {
  const [query, setQuery] = React.useState("");
  const [broken, setBroken] = React.useState<Set<number>>(() => new Set());
  const q = query.trim().toLowerCase();
  const shown = skins.filter((s) => !broken.has(s.num) && (!q || s.name.toLowerCase().includes(q) || s.num === 0));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {skins.length > 6 ? <SearchInput value={query} onChange={setQuery} placeholder={`Search ${skins.length - 1} skins…`} label="Search skins" testId="skin-search" /> : null}
      <ul role="radiogroup" aria-label="Skin artwork" className="grid min-h-0 grid-cols-3 content-start gap-2 min-[480px]:grid-cols-4 lg:flex-1 lg:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] lg:overflow-y-auto lg:overscroll-contain lg:pr-1" data-testid="skin-options">
        {shown.map((s) => {
          const on = s.num === value;
          return (
            <li key={s.num}>
              <button type="button" role="radio" aria-checked={on} onClick={() => onChange(s.num)} title={s.name} className={cn("group w-full overflow-hidden rounded-lg border text-left transition-[border-color,box-shadow]", on ? "border-accent ring-2 ring-accent" : "border-border hover:border-border-strong")} data-testid="skin-option" data-num={s.num}>
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
                    <span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-accent text-bg shadow-md shadow-black/40">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span className={cn("block truncate px-1.5 py-1.5 text-xs", on ? "bg-accent/15 font-semibold text-fg" : "text-fg-muted")}>{s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {q && shown.length <= 1 ? <p className="text-xs text-fg-subtle">No skin matches “{query}”.</p> : null}
    </div>
  );
}
