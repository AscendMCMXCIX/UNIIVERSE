"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Maximize2, Monitor, Redo2, RotateCcw, Scan, Smartphone, Trash2, Undo2 } from "lucide-react";
import { championArtUrl, type CardAccent, type CardArt } from "@/domain/player-card";
import {
  applyPreset,
  ART_SOURCES,
  artPlacement,
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
  swatchName,
  TAGLINE_MAX,
  taglineProblem,
  withPlacePosition,
  type ArtPlace,
  type ArtPosition,
  type CardLook,
  type CardPresetId,
  type CardStyle,
} from "@/domain/card-style";
import { cardPreviewFiguresAction, listChampionSkinsAction, removeCardBannerAction, setCardStyleAction, uploadCardBannerAction } from "@/server/actions/players";
import { ownSocialLinksAction, saveSocialLinksAction } from "@/server/actions/account";
import { visibleSocialLinks, type SocialKind } from "@/domain/social-links";
import { ON_THE_PUBLIC_PAGE } from "@/domain/privacy";
import { SocialLinksFields, socialDraftChanged, socialDraftLinks, socialDraftOf, socialDraftProblems, type SocialDraft } from "@/components/settings/social-links-editor";
import type { PickerChampion } from "@/components/champions/types";
import { ChampionGrid } from "@/components/champions/champion-grid";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Button } from "@/components/ui/button";
import { CLEAR_OF_CONTROLS, DetailModal } from "@/components/ui/detail-modal";
import { Fold } from "@/components/ui/fold";
import { useKeyboardFit } from "@/components/ui/keyboard-fit";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { tabIndicatorClass } from "@/components/ui/tab-bar";
import { toast } from "@/components/ui/toast";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { deviceBase } from "@/components/device-storage";
import { CardArtLayer } from "./card-art";
import { CardFrame, cardShellStyle, EMBLEM_ICONS } from "./card-look";
import { prepareBanner } from "./banner-image";
import { ArtSurface, StudioPreview } from "./studio-stage";
import { CONTEXT_LABEL, CONTEXT_PLACE, PLACE_LABEL, PREVIEW_CONTEXTS, type PreviewContext, type PreviewDevice, type StudioPreviewData } from "./studio-preview";

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
  /** The player's real card content for the previews (roles, rank, season figures, pool); placeholders where absent. */
  preview?: StudioPreviewData;
  /**
   * The card is the viewer's own: the Studio also edits their YouTube, Twitch and Discord (the
   * Socials section, saved with the card). Never for someone else's card: links are always the session's own.
   */
  ownLinks?: boolean;
  /** Where the Studio was opened from: its preview starts on that place (the profile header, or the Team card). */
  origin?: "header" | "team";
  /** The public team page shows Riot data (the server's PUBLIC_RIOT_DATA), so its preview shows the figures too. */
  publicFigures?: boolean;
}

export type { StudioPreviewData } from "./studio-preview";

/** Skins already fetched in this tab, per champion. */
const skinCache = new Map<string, Array<{ num: number; name: string }>>();

/**
 * The Studio's four sections, each open at any time in any order: nothing is a step, and Save works
 * from anywhere. Socials appears on your own card only.
 */
const SECTIONS = ["appearance", "artwork", "identity", "socials"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_LABEL: Record<Section, string> = { appearance: "Appearance", artwork: "Artwork", identity: "Identity", socials: "Socials" };

/** The Socials section's state: loading, the links as saved and as edited, or why they could not be loaded. */
type LinksState = { kind: "loading" } | { kind: "ready"; saved: SocialDraft; draft: SocialDraft } | { kind: "failed"; error: string };

/** A banner change waiting for Save: a new picture (data URL) or removal. */
type BannerDraft = { kind: "keep" } | { kind: "new"; dataUrl: string } | { kind: "remove" };

/** Everything Undo and Redo step through: the look, the champion and skin, and the banner (social links are text fields, with the browser's own undo). */
interface Draft {
  style: CardStyle;
  pick: { championId: string | null; skinNum: number };
  banner: BannerDraft;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The sections whose settings differ from the saved card (marked on their tab). */
function editedSections(d: Draft, saved: Draft, links: boolean): Set<Section> {
  const out = new Set<Section>();
  const a = d.style;
  const b = saved.style;
  if (!same(a.colours, b.colours) || a.frame !== b.frame || !same(a.effects, b.effects) || a.identity.theme !== b.identity.theme || a.preset !== b.preset) out.add("appearance");
  if (!same(a.art, b.art) || !same(d.pick, saved.pick) || d.banner.kind !== "keep") out.add("artwork");
  if (a.identity.tagline !== b.identity.tagline || a.identity.emblem !== b.identity.emblem || a.identity.nameStyle !== b.identity.nameStyle) out.add("identity");
  if (links) out.add("socials");
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

/** The preview's size (Fit or Actual size) is remembered on each device. */
const PREVIEW_KEY = deviceBase("card-preview");

/**
 * A tall-enough phone or tablet window with too little height for the preview above a section that
 * scrolls on its own: an upright phone at a large text size (a 320 × 568 phone at 150% is 23.7rem
 * tall; its window header and action bar wrap, and the section had no room left at all). There the
 * Studio's body scrolls as one, the preview and the section tabs (pinned) with the section: still one
 * scrolling area. TIGHT holds each part's classes (whole strings, for Tailwind).
 */
const TIGHT = {
  root: "max-lg:not-short:[@media(max-height:32rem)]:grid-rows-[max-content_max-content_max-content] max-lg:not-short:[@media(max-height:32rem)]:overflow-y-auto max-lg:not-short:[@media(max-height:32rem)]:overscroll-contain",
  tabs: "max-lg:not-short:[@media(max-height:32rem)]:sticky max-lg:not-short:[@media(max-height:32rem)]:top-0 max-lg:not-short:[@media(max-height:32rem)]:z-10 max-lg:not-short:[@media(max-height:32rem)]:bg-bg-elevated",
  panel: "max-lg:not-short:[@media(max-height:32rem)]:overflow-y-visible",
} as const;

/** Where the preview stands beside the controls: desktops, and phones held sideways (no height to spare above them). */
const SIDE_BY_SIDE = "(min-width: 64rem), (max-height: 480px)";

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

/** Changes of one continuous control closer together than this are one step for Undo (a slider's drag, a word typed, a pinch). */
const UNDO_BURST_MS = 600;

/**
 * Names the next change as part of a continuous gesture (a slider's drag, typing, the artwork moved
 * in the preview): changes of the same gesture in quick succession are one step for Undo. A tap
 * (a preset, a choice) is always a step of its own.
 */
const BurstContext = React.createContext<(key: string) => void>(() => {});

/**
 * The draft with Undo and Redo: every change goes on the history, a gesture's run of changes (BurstContext) as one
 * step. Client state only, emptied when the Studio closes (Save or Cancel).
 */
function useDraftHistory(initial: Draft) {
  const [state, setState] = React.useState<{ past: Draft[]; present: Draft; future: Draft[]; at: number; burst: string | null }>({ past: [], present: initial, future: [], at: 0, burst: null });
  const pending = React.useRef<string | null>(null);
  const mark = React.useCallback((key: string) => {
    pending.current = key;
  }, []);
  const change = React.useCallback((fn: (d: Draft) => Draft) => {
    const burst = pending.current;
    pending.current = null;
    setState((s) => {
      const next = fn(s.present);
      if (next === s.present || same(next, s.present)) return s;
      const now = Date.now();
      // Within a gesture the step before it stays the one Undo returns to.
      const past = burst && burst === s.burst && now - s.at < UNDO_BURST_MS && s.past.length ? s.past : [...s.past, s.present].slice(-100);
      return { past, present: next, future: [], at: now, burst };
    });
  }, []);
  const undo = React.useCallback(() => setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1]!, future: [s.present, ...s.future], at: 0, burst: null } : s)), []);
  const redo = React.useCallback(() => setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0]!, future: s.future.slice(1), at: 0, burst: null } : s)), []);
  return { draft: state.present, change, mark, undo, redo, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

/** A key press meant for a text field (its own undo), not for the Studio's. */
function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest("textarea, [contenteditable=true], input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=color]):not([type=button]):not([type=file])");
}

/**
 * Card Studio, opened by CustomiseCardButton (customise-card-button.tsx), which loads this module
 * only when it is first wanted. Nothing is saved until Save; Cancel leaves the saved card exactly as
 * it was.
 *
 * Desktops: the live preview at the left, about 45% of the window, as large as the place it shows
 * allows (Fit) or at its real size (Actual size), and the four sections at the right. Phones and
 * tablets: the preview above (as large as a third of the screen allows), the section tabs, the
 * section's controls in the one area that scrolls, and the action bar. A phone held sideways keeps
 * the preview beside the controls.
 */
export function CardStudio({ playerId, name, avatarUrl, art, accent, look, champions, poolIds, preview, ownLinks = false, origin = "team", publicFigures = false, onClose }: CustomiseCardProps & { onClose: () => void }) {
  const sections: readonly Section[] = ownLinks ? SECTIONS : SECTIONS.filter((s) => s !== "socials");
  const router = useRouter();
  const savedStyle = React.useMemo<CardStyle>(() => look?.style ?? legacyCardStyle(accent), [look, accent]);
  const initialPick = React.useMemo(() => ({ championId: art?.championId ?? poolIds[0] ?? null, skinNum: art?.skinNum ?? 0 }), [art, poolIds]);
  const saved = React.useMemo<Draft>(() => ({ style: savedStyle, pick: initialPick, banner: { kind: "keep" } }), [savedStyle, initialPick]);
  const { draft, change, mark, undo, redo, canUndo, canRedo } = useDraftHistory(saved);
  const { style, pick, banner } = draft;
  const [section, setSection] = React.useState<Section>("appearance");
  const sideBySide = useMedia(SIDE_BY_SIDE);
  const phoneWindow = useMedia("(max-width: 39.99rem) and (min-height: 480.02px)");
  const [context, setContext] = React.useState<PreviewContext>(origin === "header" ? "header" : "team");
  const [device, setDevice] = React.useState<PreviewDevice | null>(null);
  const shownDevice: PreviewDevice = device ?? (phoneWindow ? "mobile" : "desktop");
  // Fit or Actual size, remembered on this device (Settings → On this device can clear it).
  const [fit, setFitState] = React.useState<"fit" | "actual">(() => {
    try {
      return window.localStorage.getItem(PREVIEW_KEY) === "actual" ? "actual" : "fit";
    } catch {
      return "fit";
    }
  });
  const setFit = (v: "fit" | "actual") => {
    setFitState(v);
    try {
      window.localStorage.setItem(PREVIEW_KEY, v);
    } catch {
      // Private browsing: remembered for this visit only.
    }
  };
  // A confirmation in the action bar: leaving with unsaved changes.
  const [confirm, setConfirm] = React.useState<"discard" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const root = React.useRef<HTMLDivElement>(null);
  const controls = React.useRef<HTMLElement>(null);
  const keyboard = useKeyboardFit(root);

  // The profile does not load the Team card's figures; fetch them once so the preview shows the
  // real card. "loading" keeps the tiles as placeholders meanwhile; null means none to show.
  const [figures, setFigures] = React.useState<StudioPreviewData["season"] | "loading">(preview && preview.season === null ? "loading" : (preview?.season ?? null));
  const [seasonLabel, setSeasonLabel] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!preview || preview.season !== null) return;
    let live = true;
    void cardPreviewFiguresAction(playerId, preview.role ?? null).then((r) => {
      if (!live) return;
      setFigures(r.ok ? (r.data?.season ?? null) : null);
      if (r.ok && r.data?.seasonLabel) setSeasonLabel(r.data.seasonLabel);
    });
    return () => {
      live = false;
    };
  }, [playerId, preview]);
  // Your own card: your links as stored (shown publicly or not), loaded once when the Studio opens.
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
  // The previews' icons follow the links as they are edited (what teammates would see).
  const previewSocial = React.useMemo(() => (linksDraft ? visibleSocialLinks(socialDraftLinks(linksDraft)) : undefined), [linksDraft]);
  const previewData = React.useMemo<StudioPreviewData | null>(() => (preview ? { ...preview, season: figures === "loading" ? null : figures, ...(seasonLabel && !preview.seasonLabel ? { seasonLabel } : {}), ...(previewSocial ? { social: previewSocial } : {}) } : null), [preview, figures, seasonLabel, previewSocial]);

  const bannerUrl = banner.kind === "new" ? banner.dataUrl : banner.kind === "remove" ? null : (look?.bannerUrl ?? null);
  // The champion grid and skins never re-render for a style change (stable props, memoised).
  const previewLook = React.useMemo<CardLook>(() => ({ style, bannerUrl }), [style, bannerUrl]);
  const previewArt = React.useMemo<CardArt | null>(() => (pick.championId ? { championId: pick.championId, skinNum: pick.skinNum } : null), [pick]);
  const dirty = !same(draft, saved) || !!linksChanged;
  const edited = React.useMemo(() => editedSections(draft, saved, !!linksChanged), [draft, saved, linksChanged]);
  const tagProblem = style.identity.tagline ? taglineProblem(style.identity.tagline) : null;
  // The artwork place the preview shows (none: a phone's Players row, or colours only).
  const place: ArtPlace | null = style.art.source === "none" ? null : CONTEXT_PLACE[context][shownDevice];

  const set = React.useCallback<Setter>((fn) => change((d) => ({ ...d, style: { ...fn(d.style), preset: d.style.preset } })), [change]);
  const onPreset = React.useCallback((id: CardPresetId) => change((d) => ({ ...d, style: applyPreset(d.style, id) })), [change]);
  const onChampion = React.useCallback((id: string) => change((d) => (d.pick.championId === id ? d : { ...d, pick: { championId: id, skinNum: 0 } })), [change]);
  const onSkin = React.useCallback((n: number) => change((d) => (d.pick.skinNum === n ? d : { ...d, pick: { ...d.pick, skinNum: n } })), [change]);
  const onBanner = React.useCallback((b: BannerDraft, source?: CardStyle["art"]["source"]) => change((d) => ({ ...d, banner: b, style: source ? { ...d.style, art: { ...d.style.art, source } } : d.style })), [change]);
  const onLink = React.useCallback((kind: SocialKind, patch: Partial<SocialDraft[SocialKind]>) => {
    setLinks((l) => (l?.kind === "ready" ? { ...l, draft: { ...l.draft, [kind]: { ...l.draft[kind], ...patch } } } : l));
    setError(null);
  }, []);
  /**
   * The artwork's position where the preview shows it: that place's own when it has one, else the shared
   * one. Takes what changed, merged onto the draft's current position inside the update: two sliders
   * flushed in one frame (each from its last render) no longer undo each other's axis.
   */
  const onPosition = React.useCallback(
    (patch: Partial<ArtPosition>) => {
      mark("position");
      change((d) => {
        if (!place) return d;
        const cur = artPlacement(d.style, place);
        const p = { focusX: patch.focusX ?? cur.focusX, focusY: patch.focusY ?? cur.focusY, zoom: patch.zoom ?? cur.zoom };
        const own = d.style.art.places?.[place];
        if (own) return { ...d, style: withPlacePosition(d.style, place, p) };
        return { ...d, style: { ...d.style, art: { ...d.style.art, focusX: p.focusX, focusY: p.focusY, zoom: p.zoom } } };
      });
    },
    [change, mark, place],
  );
  const goTo = React.useCallback((next: Section) => {
    setSection(next);
    controls.current?.scrollTo({ top: 0 });
  }, []);

  // Escape, the close button and a click outside first close a question in the action bar, then ask
  // before unsaved changes are lost (in the action bar). Cancel asks the same.
  const canClose = () => {
    if (busy) return false;
    if (confirm) return (setConfirm(null), false);
    if (!dirty) return true;
    setConfirm("discard");
    return false;
  };
  const cancel = () => (dirty ? setConfirm("discard") : onClose());
  // Going back in the browser does the same as Escape (see useBackGuard).
  useBackGuard(dirty && !busy && confirm !== "discard", () => void canClose());
  // Reset look: the standard card at once (Undo brings the look back), keeping your artwork, tagline and emblem.
  const resetLook = () =>
    change((d) => ({ ...d, style: { ...DEFAULT_CARD_STYLE, art: { ...DEFAULT_CARD_STYLE.art, source: d.style.art.source }, identity: { ...DEFAULT_CARD_STYLE.identity, tagline: d.style.identity.tagline, emblem: d.style.identity.emblem } } }));
  // Leaving the page (reload, closing the tab) with unsaved changes asks the browser's own question.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  // Ctrl/⌘ Z undoes, Shift Ctrl/⌘ Z and Ctrl Y redo, except in a text field (which keeps its own).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || inTextField(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) undo();
      else if ((key === "z" && e.shiftKey) || (key === "y" && !e.metaKey)) redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const save = async () => {
    if (tagProblem) return setError(tagProblem);
    if (linksProblem) {
      goTo("socials");
      return setError(linksProblem);
    }
    setBusy(true);
    setError(null);
    // Your links first: if they are refused, nothing else has changed yet.
    if (links?.kind === "ready" && linksChanged) {
      const r = await saveSocialLinksAction(links.draft);
      if (!r.ok) {
        setBusy(false);
        goTo("socials");
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
    const withSource = style.art.source === "banner" && !bannerUrl ? { ...style, art: { ...style.art, source: "champion" as const } } : style;
    // The places' own positions always go with the look (none: every one was reset), so the server never keeps one the player removed.
    const finalStyle = { ...withSource, art: { ...withSource.art, places: withSource.art.places ?? {} } };
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
    // Undo and Redo wrap under the title where the row has no room for them (a 320px phone at 150% text), never under the close button.
    <div className={cn("flex min-h-12 flex-wrap items-center gap-x-3 py-2 pl-4 sm:pl-5 short:min-h-0 short:py-1", CLEAR_OF_CONTROLS)}>
      <h2 id="studio-title" className="shrink-0 text-base font-semibold leading-tight text-fg sm:text-lg">
        Card Studio
      </h2>
      <p className={cn("flex min-w-0 basis-0 items-center gap-1.5 truncate text-xs", dirty ? "flex-1 text-warn" : "sr-only")} data-testid="studio-status" aria-live="polite">
        {dirty ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden /> : null}
        {dirty ? "Unsaved changes" : "No changes"}
      </p>
      <span className="ml-auto flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={undo} disabled={!canUndo || busy} className={ICON_BUTTON} aria-label="Undo" title="Undo (Ctrl+Z)" aria-keyshortcuts="Control+Z Meta+Z" data-testid="studio-undo">
          <Undo2 className="h-4 w-4" aria-hidden />
        </button>
        <button type="button" onClick={redo} disabled={!canRedo || busy} className={ICON_BUTTON} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" data-testid="studio-redo">
          <Redo2 className="h-4 w-4" aria-hidden />
        </button>
      </span>
    </div>
  );

  const footer = confirm ? (
    <ConfirmBar onKeep={() => setConfirm(null)} onConfirm={onClose} />
  ) : (
    <>
      {error ? (
        <p role="alert" className="w-full text-sm text-bad" data-testid="studio-error">
          {error}
        </p>
      ) : null}
      <Button variant="ghost" onClick={resetLook} disabled={busy} className="mr-auto px-2.5 max-[359px]:min-w-11" data-testid="studio-reset-all" title="Reset look">
        <RotateCcw className="h-4 w-4" aria-hidden /> <span className="max-[359px]:sr-only">Reset look</span>
      </Button>
      <Button variant="ghost" onClick={cancel} disabled={busy} data-testid="studio-cancel">
        Cancel
      </Button>
      <Button variant="primary" onClick={save} disabled={busy || !!tagProblem || links?.kind === "loading"} className="min-w-24" data-testid="save-card-style">
        {busy ? "Saving…" : "Save"}
      </Button>
    </>
  );

  const subject = React.useMemo(() => ({ playerId, name, avatarUrl, art: previewArt, look: previewLook, data: previewData, champions, own: ownLinks, publicFigures }), [playerId, name, avatarUrl, previewArt, previewLook, previewData, champions, ownLinks, publicFigures]);
  const noFigures = (context === "team" || context === "public") && figures !== "loading" && !previewData?.season && (preview?.showRank ?? true);

  return (
    <BurstContext.Provider value={mark}>
    <DetailModal open onClose={onClose} canClose={canClose} title="Card Studio" titleId="studio-title" size="full" className="sm:h-[min(calc(100%-3rem),64rem)] sm:w-[min(calc(100%-3rem),100rem)]" header={header} headerClassName="border-b border-border" innerScroll testId="card-studio-window" footer={footer}>
      <div
        ref={root}
        className={cn("relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] lg:grid-rows-[auto_minmax(0,1fr)] short:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] short:grid-rows-[auto_minmax(0,1fr)]", TIGHT.root)}
        data-testid="card-studio"
        data-section={section}
        data-keyboard={keyboard || undefined}
      >
        {/* The live preview: beside the controls on desktops and on a phone held sideways, above them otherwise. */}
        <div className={cn("flex min-h-0 min-w-0 flex-col gap-1.5 border-b border-border bg-bg/40 px-3 pb-1.5 pt-1.5 sm:gap-2 sm:pb-2 sm:pt-2 lg:row-span-2 lg:gap-3 lg:border-b-0 lg:border-r lg:p-5 short:row-span-2 short:gap-1.5 short:border-b-0 short:border-r short:p-2")} data-testid="studio-preview-pane">
          {/* The choosers wrap (the screen and size under the place) rather than squeeze the place's select under 5rem (a 320px phone at 150% text). */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Select value={context} onValueChange={(v) => setContext(v as PreviewContext)} options={PREVIEW_CONTEXTS.map((c) => ({ value: c, label: CONTEXT_LABEL[c] }))} aria-label="Preview" className="min-w-20 flex-1" data-testid="preview-context" />
            <div role="radiogroup" aria-label="Screen" className={segmentedGroupClass("shrink-0")} data-testid="preview-device">
              {(
                [
                  ["desktop", Monitor, "Desktop"],
                  ["mobile", Smartphone, "Mobile"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button key={v} type="button" role="radio" aria-checked={shownDevice === v} onClick={() => setDevice(v)} title={label} className={segmentClass(shownDevice === v, { className: "pointer-coarse:min-w-11" })} data-testid={`preview-${v}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden /> <span className="max-sm:sr-only short:sr-only lg:max-xl:sr-only">{label}</span>
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Preview size" className={segmentedGroupClass("shrink-0")} data-testid="preview-size">
              {(
                [
                  ["fit", Scan, "Fit"],
                  ["actual", Maximize2, "Actual size"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button key={v} type="button" role="radio" aria-checked={fit === v} onClick={() => setFit(v)} title={label} className={segmentClass(fit === v, { className: "pointer-coarse:min-w-11" })} data-testid={`preview-${v}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden /> <span className="max-sm:sr-only short:sr-only lg:max-xl:sr-only">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <StudioPreview
            context={context}
            device={shownDevice}
            fit={fit}
            subject={subject}
            className={cn("h-[clamp(8.5rem,32dvh,19rem)] lg:h-auto lg:flex-1 short:h-auto short:flex-1", keyboard && "max-lg:h-24")}
            // Above the controls the stage is no taller than the place in it (a phone's header left an
            // empty band above and below it): the section gets the room (page budgets, studio@i15: 1.43
            // screens with the stage at its full height, 1.3 allowed).
            hug={sideBySide || keyboard ? undefined : "clamp(8.5rem, 32dvh, 19rem)"}
            surface={(box, scale) =>
              place && pick.championId !== null ? <ArtSurface box={box} scale={scale} placement={artPlacement(style, place)} blur={style.art.blur} label={PLACE_LABEL[place]} own={!!style.art.places?.[place]} onChange={onPosition} /> : null
            }
          />
          {noFigures ? (
            <p className="text-center text-xs text-fg-subtle max-lg:hidden" data-testid="preview-figures-note">
              No season figures yet: the tiles fill in once this season&apos;s games are synced.
            </p>
          ) : null}
        </div>

        {/* The sections: tabs, any one at any time. */}
        <div role="tablist" aria-label="Card Studio sections" className={cn("flex min-w-0 shrink-0 gap-1 overflow-x-auto border-b border-border px-2 [scrollbar-width:none] lg:px-4 short:px-2 [&::-webkit-scrollbar]:hidden", TIGHT.tabs)} data-testid="studio-sections">
          {sections.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`studio-tab-${id}`}
              aria-selected={section === id}
              aria-controls="studio-section-panel"
              tabIndex={section === id ? 0 : -1}
              onClick={() => goTo(id)}
              onKeyDown={(e) => {
                const at = sections.indexOf(id);
                const to = e.key === "ArrowRight" ? sections[(at + 1) % sections.length] : e.key === "ArrowLeft" ? sections[(at - 1 + sections.length) % sections.length] : e.key === "Home" ? sections[0] : e.key === "End" ? sections[sections.length - 1] : null;
                if (!to) return;
                e.preventDefault();
                goTo(to);
                document.getElementById(`studio-tab-${to}`)?.focus();
              }}
              className={cn("inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent short:min-h-10", tabIndicatorClass(section === id))}
              data-testid={`studio-tab-${id}`}
            >
              {SECTION_LABEL[id]}
              {edited.has(id) ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-warn" title="Changed" aria-hidden />
                  <span className="sr-only"> (changed)</span>
                </>
              ) : null}
            </button>
          ))}
        </div>

        {/* The section: the only part of the Studio that scrolls (in a TIGHT window, the body around it). */}
        <section ref={controls} id="studio-section-panel" role="tabpanel" aria-labelledby={`studio-tab-${section}`} className={cn("min-h-0 min-w-0 overflow-y-auto overscroll-contain px-4 pb-4 pt-3 sm:pb-6 sm:pt-4 lg:px-6 lg:pb-6 short:px-3 short:pt-3", TIGHT.panel)} data-testid={`studio-panel-${section}`}>
          {section === "appearance" ? <AppearancePanel style={style} saved={savedStyle} set={set} change={change} onPreset={onPreset} art={previewArt} bannerUrl={bannerUrl} /> : null}
          {section === "artwork" ? (
            <ArtworkPanel style={style} saved={saved} draft={draft} set={set} change={change} bannerUrl={bannerUrl} hasSavedBanner={!!look?.bannerUrl} onBanner={onBanner} pick={pick} champions={champions} poolIds={poolIds} onChampion={onChampion} onSkin={onSkin} place={place} sideBySide={sideBySide} onPosition={onPosition} />
          ) : null}
          {section === "identity" ? <IdentityPanel style={style} saved={savedStyle} set={set} change={change} problem={tagProblem} /> : null}
          {section === "socials" && links ? <LinksPanel state={links} onChange={onLink} /> : null}
        </section>
      </div>
    </DetailModal>
    </BurstContext.Provider>
  );
}

const ICON_BUTTON = "grid h-9 w-9 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11";

/** The question in the action bar before unsaved changes are lost. */
function ConfirmBar({ onKeep, onConfirm }: { onKeep: () => void; onConfirm: () => void }) {
  const id = React.useId();
  return (
    <div role="alertdialog" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 motion-safe:fade-in" data-testid="studio-confirm-discard">
      <p className="min-w-0 flex-[1_1_14rem] text-sm leading-snug">
        <span id={`${id}-t`} className="font-semibold text-fg">
          Discard your changes?
        </span>{" "}
        <span id={`${id}-d`} className="text-fg-muted">
          The saved card stays as it was.
        </span>
      </p>
      <span className="ml-auto flex shrink-0 gap-2">
        <Button variant="ghost" onClick={onKeep} autoFocus data-testid="studio-confirm-keep">
          Keep editing
        </Button>
        <Button variant="danger" onClick={onConfirm} data-testid="studio-confirm-yes">
          Discard
        </Button>
      </span>
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────────────────────────

type Setter = (fn: (s: CardStyle) => CardStyle) => void;
type Change = (fn: (d: Draft) => Draft) => void;

/** An emblem's name as a person reads it: "Flame", "Paw" (its id is lowercase; tooltip inventory S16). */
const emblemName = (id: string) => `${id.charAt(0).toUpperCase()}${id.slice(1).replace(/-/g, " ")}`;

/** A section's heading, with "Undo changes" back to the saved card where this part was changed. */
function Part({ title, changed, onRevert, children, testId, className }: { title: string; changed?: boolean; onRevert?: () => void; children: React.ReactNode; testId?: string; className?: string }) {
  return (
    <section className={cn("space-y-3", className)} data-testid={testId}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h3 className="text-2xs font-semibold uppercase tracking-label text-fg-subtle">{title}</h3>
        {changed && onRevert ? (
          <button type="button" onClick={onRevert} className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg pointer-coarse:min-h-10" aria-label={`Undo changes: ${title}`} data-testid="revert-part">
            <Undo2 className="h-3 w-3" aria-hidden /> Undo changes
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** A labelled setting with a reset-to-standard button when it differs from the standard card. */
function Field({ label, hint, changed = false, onReset, children, testId }: { label: string; hint?: string; changed?: boolean; onReset?: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <span className="min-w-0 text-sm font-medium text-fg">
          {label}
          {hint ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">{hint}</span> : null}
        </span>
        {changed && onReset ? (
          <button type="button" onClick={onReset} className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg pointer-coarse:min-h-10" aria-label={`Reset ${label}`} data-testid="reset-setting">
            <RotateCcw className="h-3 w-3" aria-hidden /> Reset
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** A choice of a few, in words: the shared text-led segments (ui/segmented.tsx), wrapping where the line is short. */
function Choice<T extends string>({ value, options, labels, onChange, label }: { value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void; label: string; columns?: number }) {
  return (
    <div role="radiogroup" aria-label={label} className={segmentedGroupClass("-ml-2.5")}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={segmentClass(value === o, { size: "md" })} data-value={o}>
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
 * outside (a preset, Reset, Undo, a drag on the preview) replaces the local one. The track fills up to the thumb.
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
  const mark = React.useContext(BurstContext);
  React.useLayoutEffect(() => {
    latest.current = onChange;
  });
  const flush = React.useCallback(() => {
    frame.current = null;
    setSent(pending.current);
    mark(`slider:${label}`);
    latest.current(pending.current);
  }, [mark, label]);
  // Leaving the section mid-drag still keeps the last position.
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

function ColourPicker({ value, onChange: commit, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const mark = React.useContext(BurstContext);
  // The colour well and the hex field change continuously (a drag across the well, typing): one step for Undo.
  const onChange = (v: string, gesture = false) => {
    if (gesture) mark(`colour:${label}`);
    commit(v);
  };
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
          <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={swatchName(c)} onClick={() => onChange(c)} className={cn("grid aspect-square w-full place-items-center rounded-full transition-[box-shadow] sm:h-7 sm:w-7 pointer-coarse:sm:h-10 pointer-coarse:sm:w-10", value === c ? "ring-2 ring-fg ring-offset-2 ring-offset-bg-elevated" : "ring-1 ring-inset ring-black/20")} style={{ background: c }}>
            {value === c ? <Check className="h-4 w-4 drop-shadow" style={{ color: readableOn(c) }} aria-hidden /> : null}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toLowerCase(), true)} aria-label={`${label}: custom`} className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-border bg-bg-elevated pointer-coarse:h-11" />
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase(), true);
          }}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="none"
          enterKeyHint="done"
          aria-label={`${label}: hex value`}
          className="h-9 w-28 rounded-lg border border-border bg-bg-elevated px-2.5 font-mono text-base text-fg sm:pointer-fine:text-sm pointer-coarse:h-11"
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

// ── Appearance ──────────────────────────────────────────────────────────────────────────────────

const D = DEFAULT_CARD_STYLE;
const FRAME_LABEL: Record<CardStyle["frame"], string> = { none: "No frame", minimal: "Minimal", outline: "Clean outline", double: "Double line", angular: "Angular", glow: "Soft glow", premium: "Premium" };

/**
 * A preset as it would look on this card: the player's artwork under the preset's veil, wash, frame
 * and colours, the name in its style (one picture for all seven: the preview's, already loaded).
 * One tap sets the whole look; the artwork, its position, tagline, emblem and links stay.
 */
const PresetTile = React.memo(function PresetTile({ id, style, art, bannerUrl, on, onApply }: { id: CardPresetId; style: CardStyle; art: CardArt | null; bannerUrl: string | null; on: boolean; onApply: (id: CardPresetId) => void }) {
  const look = React.useMemo<CardLook>(() => ({ style: applyPreset(style, id), bannerUrl }), [style, id, bannerUrl]);
  const p = PRESET_INFO[id];
  return (
    <button type="button" onClick={() => onApply(id)} aria-pressed={on} className={cn("group relative rounded-panel border p-1 text-left transition-colors", on ? "border-accent bg-accent/10 ring-1 ring-accent" : "border-border hover:border-border-strong")} data-testid={`preset-${id}`}>
      <span className="relative block h-12 overflow-hidden rounded-lg border border-border sm:h-16" style={cardShellStyle(look, { glow: false })}>
        <CardArtLayer art={art} accent={look.style.colours.primary} kind="splash" look={look} decorate={false} smooth={false} foot testId="preset-art" place="card" />
        <CardFrame look={look} />
        <span className={cn("absolute inset-x-2 bottom-1.5 truncate text-xs text-fg drop-shadow", look.style.identity.nameStyle === "bold" ? "font-extrabold" : look.style.identity.nameStyle === "italic" ? "font-semibold italic" : look.style.identity.nameStyle === "wide" ? "font-semibold uppercase tracking-label" : "font-semibold")}>
          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: `linear-gradient(135deg, ${look.style.colours.primary}, ${look.style.colours.secondary})` }} aria-hidden />
          {p.label}
        </span>
      </span>
      {on ? (
        <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-accent text-bg shadow-md shadow-black/40">
          <Check className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : null}
    </button>
  );
});

function AppearancePanel({ style, saved, set, change, onPreset, art, bannerUrl }: { style: CardStyle; saved: CardStyle; set: Setter; change: Change; onPreset: (id: CardPresetId) => void; art: CardArt | null; bannerUrl: string | null }) {
  const c = style.colours;
  const fx = style.effects;
  const lifted = readableColour(c.primary) !== c.primary;
  const any = fx.glow || fx.shimmer || fx.drift || fx.motif !== "none";
  const noWash = c.gradient === "none";
  const revert = (fn: (s: CardStyle) => CardStyle) => change((d) => ({ ...d, style: fn(d.style) }));
  return (
    <div className="space-y-4 sm:space-y-6">
      <Part title="Style" changed={style.preset !== saved.preset} onRevert={() => revert((s) => ({ ...s, colours: saved.colours, frame: saved.frame, effects: saved.effects, identity: { ...s.identity, nameStyle: saved.identity.nameStyle, theme: saved.identity.theme }, art: { ...s.art, darkness: saved.art.darkness, blur: saved.art.blur, vignette: saved.art.vignette }, preset: saved.preset }))}>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 sm:gap-2" data-testid="studio-presets">
          {CARD_PRESETS.map((id) => (
            <PresetTile key={id} id={id} style={style} art={art} bannerUrl={bannerUrl} on={style.preset === id} onApply={onPreset} />
          ))}
        </div>
      </Part>

      <Part title="Colours" changed={!same(c, saved.colours) || style.identity.theme !== saved.identity.theme} onRevert={() => revert((s) => ({ ...s, colours: saved.colours, identity: { ...s.identity, theme: saved.identity.theme } }))} testId="studio-colours">
        <div className="grid grid-cols-5 gap-1.5" data-testid="palettes">
          {CARD_PALETTES.map((p) => {
            const on = c.primary === p.primary && c.secondary === p.secondary;
            return (
              <button key={p.label} type="button" aria-pressed={on} onClick={() => set((s) => ({ ...s, colours: { ...s.colours, primary: p.primary, secondary: p.secondary } }))} title={p.label} className={cn("flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg border px-2 text-xs font-medium transition-colors sm:min-h-10 sm:justify-start pointer-coarse:min-h-11", on ? "border-accent bg-accent/12 text-fg ring-1 ring-accent" : "border-border text-fg-muted hover:text-fg")}>
                <span className="h-5 w-5 shrink-0 rounded-full ring-1 ring-black/20" style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)` }} aria-hidden />
                {/* Phones: the colours alone (the name is the button's, read out and in its title); wider, the name beside them. */}
                <span className="min-w-0 flex-1 truncate text-left max-sm:sr-only">{p.label}</span>
                {on ? <Check className="h-4 w-4 shrink-0 text-accent max-sm:hidden" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
        <Fold variant="row" tone="fg" summary={<span className="text-sm">Custom colours, wash and surface</span>} testId="fold-colours">
          <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
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
            <Field label="Card surface" changed={style.identity.theme !== D.identity.theme} onReset={() => set((s) => ({ ...s, identity: { ...s.identity, theme: D.identity.theme } }))}>
              <Choice label="Card surface" value={style.identity.theme} options={CARD_THEMES} labels={{ midnight: "Midnight", deep: "Deep", tinted: "Tinted" }} onChange={(v) => set((s) => ({ ...s, identity: { ...s.identity, theme: v } }))} columns={3} />
            </Field>
          </div>
        </Fold>
      </Part>

      <Fold variant="row" tone="fg" summary={<span className="flex items-center gap-2 text-sm">Frame and border<span className="text-xs font-normal text-fg-subtle">· {FRAME_LABEL[style.frame]}</span></span>} testId="fold-frame">
      <Part title="Frame and border" changed={style.frame !== saved.frame || c.border !== saved.colours.border || c.avatarFrame !== saved.colours.avatarFrame} onRevert={() => revert((s) => ({ ...s, frame: saved.frame, colours: { ...s.colours, border: saved.colours.border, avatarFrame: saved.colours.avatarFrame } }))} className="[&>div:first-child>h3]:sr-only">
        <div role="radiogroup" aria-label="Card frame" className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-3 sm:grid-cols-4 xl:grid-cols-7" data-testid="frame-options">
          {CARD_FRAMES.map((f) => {
            const look: CardLook = { style: { ...style, frame: f, effects: { ...style.effects, glow: false } }, bannerUrl: null };
            const on = style.frame === f;
            return (
              <button key={f} type="button" role="radio" aria-checked={on} onClick={() => set((s) => ({ ...s, frame: f }))} className={cn("relative rounded-panel border p-1.5 text-left transition-colors", on ? "border-accent bg-accent/10 ring-1 ring-accent" : "border-border hover:border-border-strong")} data-value={f}>
                <span className="relative block h-10 overflow-hidden rounded-lg border border-border" style={cardShellStyle(look, { glow: false })}>
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
        <div className="grid gap-x-6 gap-y-4 2xl:grid-cols-2">
          <Field label="Border" changed={c.border !== D.colours.border} onReset={() => set((s) => ({ ...s, colours: { ...s.colours, border: D.colours.border } }))}>
            <Choice label="Border" value={c.border} options={BORDER_SOURCES} labels={{ subtle: "Subtle", primary: "Primary", secondary: "Secondary", gradient: "Gradient" }} onChange={(v) => set((s) => ({ ...s, colours: { ...s.colours, border: v } }))} />
          </Field>
          <Field label="Avatar frame" changed={c.avatarFrame !== D.colours.avatarFrame} onReset={() => set((s) => ({ ...s, colours: { ...s.colours, avatarFrame: D.colours.avatarFrame } }))}>
            <Choice label="Avatar frame" value={c.avatarFrame} options={AVATAR_FRAMES} labels={{ primary: "Primary", secondary: "Secondary", gradient: "Gradient", neutral: "Neutral", none: "None" }} onChange={(v) => set((s) => ({ ...s, colours: { ...s.colours, avatarFrame: v } }))} columns={5} />
          </Field>
        </div>
      </Part>
      </Fold>

      <Fold variant="row" tone="fg" summary={<span className="flex items-center gap-2 text-sm">Effects{any ? <span className="text-xs font-normal text-fg-subtle">· on</span> : null}</span>} testId="fold-effects" defaultOpen={any}>
        <div className="space-y-4" data-testid="studio-effects">
          <div className="grid gap-x-6 lg:grid-cols-3">
            <Switch id="fx-glow" label="Ambient glow" checked={fx.glow} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, glow: v } }))} />
            <Switch id="fx-shimmer" label="Accent shimmer" checked={fx.shimmer} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, shimmer: v } }))} />
            <Switch id="fx-drift" label="Moving colour wash" description={noWash ? "Needs a colour wash (Colours)." : undefined} disabled={noWash} checked={fx.drift && !noWash} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, drift: v } }))} />
          </div>
          <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
            <Field label="Motif" changed={fx.motif !== D.effects.motif} onReset={() => set((s) => ({ ...s, effects: { ...s.effects, motif: D.effects.motif } }))}>
              <Choice label="Motif" value={fx.motif} options={CARD_MOTIFS} labels={{ none: "None", corners: "Corners", lines: "Lines", dots: "Dots", rings: "Rings" }} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, motif: v } }))} columns={5} />
            </Field>
            <Field label="Intensity" hint={any ? undefined : "turn an effect on to use it"} changed={fx.intensity !== D.effects.intensity} onReset={() => set((s) => ({ ...s, effects: { ...s.effects, intensity: D.effects.intensity } }))} testId="field-intensity">
              <Slider label="Effect intensity" value={fx.intensity} min={0} max={100} onChange={(v) => set((s) => ({ ...s, effects: { ...s.effects, intensity: v } }))} format={(v) => `${v}%`} disabled={!any} />
            </Field>
          </div>
          <p className="text-xs text-fg-subtle">Animations stop where the device asks for reduced motion.</p>
        </div>
      </Fold>
    </div>
  );
}

// ── Artwork ─────────────────────────────────────────────────────────────────────────────────────

function ArtworkPanel({
  style,
  saved,
  draft,
  set,
  change,
  bannerUrl,
  hasSavedBanner,
  onBanner,
  pick,
  champions,
  poolIds,
  onChampion,
  onSkin,
  place,
  onPosition,
}: {
  style: CardStyle;
  saved: Draft;
  draft: Draft;
  set: Setter;
  change: Change;
  bannerUrl: string | null;
  hasSavedBanner: boolean;
  onBanner: (b: BannerDraft, source?: CardStyle["art"]["source"]) => void;
  pick: Draft["pick"];
  champions: PickerChampion[];
  poolIds: string[];
  onChampion: (id: string) => void;
  onSkin: (n: number) => void;
  place: ArtPlace | null;
  sideBySide: boolean;
  onPosition: (p: Partial<ArtPosition>) => void;
}) {
  const art = style.art;
  const s = saved.style.art;
  const revertArt = () => change((d) => ({ ...d, style: { ...d.style, art: { ...d.style.art, source: s.source } }, banner: { kind: "keep" } }));
  return (
    <div className="space-y-4 sm:space-y-6">
      <Part title="Background" changed={art.source !== s.source || draft.banner.kind !== "keep"} onRevert={revertArt}>
        <BackgroundChoice style={style} set={set} bannerUrl={bannerUrl} onBanner={onBanner} hasSavedBanner={hasSavedBanner} />
      </Part>
      {art.source === "none" ? null : (
        <Part title={art.source === "banner" ? "Champion (when there is no banner)" : "Champion and skin"} changed={!same(pick, saved.pick)} onRevert={() => change((d) => ({ ...d, pick: saved.pick }))}>
          <ArtworkChooser championId={pick.championId} skinNum={pick.skinNum} champions={champions} poolIds={poolIds} onChampion={onChampion} onSkin={onSkin} />
        </Part>
      )}
      {art.source === "none" ? null : (
        <PositionPart style={style} saved={saved.style} change={change} place={place} onPosition={onPosition} />
      )}
      {art.source === "none" ? null : (
        <Part title="Readability" changed={art.darkness !== s.darkness || art.blur !== s.blur || art.vignette !== s.vignette} onRevert={() => change((d) => ({ ...d, style: { ...d.style, art: { ...d.style.art, darkness: s.darkness, blur: s.blur, vignette: s.vignette } } }))}>
          <Field label="Background darkness" hint="keeps text readable" changed={art.darkness !== D.art.darkness} onReset={() => set((x) => ({ ...x, art: { ...x.art, darkness: D.art.darkness } }))} testId="field-darkness">
            <Slider label="Background darkness" value={art.darkness} min={25} max={90} onChange={(v) => set((x) => ({ ...x, art: { ...x.art, darkness: v } }))} format={(v) => `${v}%`} />
          </Field>
          <Fold variant="row" tone="fg" summary={<span className="text-sm">Blur and vignette</span>} testId="fold-veil" defaultOpen={art.blur > 0 || art.vignette > 0}>
            <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
              <Field label="Background blur" changed={art.blur !== D.art.blur} onReset={() => set((x) => ({ ...x, art: { ...x.art, blur: D.art.blur } }))} testId="field-blur">
                <Slider label="Background blur" value={art.blur} min={0} max={12} onChange={(v) => set((x) => ({ ...x, art: { ...x.art, blur: v } }))} format={(v) => `${v}px`} />
              </Field>
              <Field label="Vignette" changed={art.vignette !== D.art.vignette} onReset={() => set((x) => ({ ...x, art: { ...x.art, vignette: D.art.vignette } }))} testId="field-vignette">
                <Slider label="Vignette" value={art.vignette} min={0} max={80} onChange={(v) => set((x) => ({ ...x, art: { ...x.art, vignette: v } }))} format={(v) => `${v}%`} />
              </Field>
            </div>
          </Fold>
        </Part>
      )}
    </div>
  );
}

/**
 * Where the artwork sits in the place the preview shows: drag it in the preview, or set it here.
 * Every place shares one position until one is given its own ("This layout only"), for a shape the
 * shared one does not suit; Use shared position takes that place back to the shared one.
 */
function PositionPart({ style, saved, change, place, onPosition }: { style: CardStyle; saved: CardStyle; change: Change; place: ArtPlace | null; onPosition: (p: Partial<ArtPosition>) => void }) {
  const own = place ? style.art.places?.[place] : undefined;
  const p = place ? artPlacement(style, place) : { focusX: style.art.focusX ?? 50, focusY: style.art.focusY ?? 20, zoom: style.art.zoom, own: false };
  const placesOwned = Object.keys(style.art.places ?? {}) as ArtPlace[];
  const sharedChanged = style.art.focusX !== saved.art.focusX || style.art.focusY !== saved.art.focusY || style.art.zoom !== saved.art.zoom || !same(style.art.places ?? {}, saved.art.places ?? {});
  const separate = (on: boolean) =>
    change((d) => {
      if (!place) return d;
      if (!on) return { ...d, style: withPlacePosition(d.style, place, null) };
      const cur = artPlacement(d.style, place);
      return { ...d, style: withPlacePosition(d.style, place, { focusX: cur.focusX, focusY: cur.focusY, zoom: cur.zoom }) };
    });
  const resetHere = () =>
    change((d) => {
      if (!place) return d;
      if (d.style.art.places?.[place]) return { ...d, style: withPlacePosition(d.style, place, null) };
      return { ...d, style: { ...d.style, art: { ...d.style.art, focusX: null, focusY: null, zoom: 1 } } };
    });
  const changedHere = own ? true : style.art.focusX !== null || style.art.focusY !== null || style.art.zoom !== 1;
  return (
    <Part title="Position" changed={sharedChanged} onRevert={() => change((d) => ({ ...d, style: { ...d.style, art: { ...d.style.art, focusX: saved.art.focusX, focusY: saved.art.focusY, zoom: saved.art.zoom, ...(saved.art.places ? { places: saved.art.places } : { places: undefined }) } } }))} testId="studio-position">
      {place ? (
        <>
          <div role="radiogroup" aria-label={`Position for ${PLACE_LABEL[place]}`} className={segmentedGroupClass("max-w-full")} data-testid="position-scope">
            <button type="button" role="radio" aria-checked={!own} onClick={() => separate(false)} className={segmentClass(!own)} data-testid="position-shared">
              Every layout
            </button>
            <button type="button" role="radio" aria-checked={!!own} onClick={() => separate(true)} className={segmentClass(!!own)} data-testid="position-own">
              {PLACE_LABEL[place]} only
            </button>
          </div>
          <p className="text-xs text-fg-subtle" data-testid="position-where">
            {own ? `Its own position: the other layouts keep the shared one.` : "Drag the artwork in the preview, or use the sliders."}
          </p>
        </>
      ) : (
        <p className="text-xs text-fg-subtle">This preview shows no artwork: choose another to position it.</p>
      )}
      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
        <Field label="Horizontal" hint={!own && style.art.focusX === null ? "automatic" : undefined} testId="field-focus-x">
          <Slider label="Horizontal position" value={p.focusX} min={0} max={100} onChange={(v) => onPosition({ focusX: v })} format={(v) => `${v}%`} disabled={!place} />
        </Field>
        <Field label="Vertical" hint={!own && style.art.focusY === null ? "automatic" : undefined} testId="field-focus-y">
          <Slider label="Vertical position" value={p.focusY} min={0} max={100} onChange={(v) => onPosition({ focusY: v })} format={(v) => `${v}%`} disabled={!place} />
        </Field>
        <Field label="Zoom" testId="field-zoom">
          <Slider label="Zoom" value={p.zoom} min={1} max={2} step={0.05} onChange={(v) => onPosition({ zoom: v })} format={(v) => `${Math.round(v * 100)}%`} disabled={!place} />
        </Field>
        <div className="flex items-end">
          {changedHere && place ? (
            <Button variant="ghost" size="sm" onClick={resetHere} data-testid="position-reset">
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {own ? "Use shared position" : "Automatic position"}
            </Button>
          ) : null}
        </div>
      </div>
      {placesOwned.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Layouts with their own position" data-testid="position-overrides">
          {placesOwned.map((pl) => (
            <li key={pl} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border pl-2.5 text-xs text-fg-muted pointer-coarse:min-h-11">
              {PLACE_LABEL[pl]}
              <button type="button" onClick={() => change((d) => ({ ...d, style: withPlacePosition(d.style, pl, null) }))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-surface-2 hover:text-fg pointer-coarse:h-11 pointer-coarse:w-11" aria-label={`Use the shared position for ${PLACE_LABEL[pl]}`} data-testid="position-override-reset">
                <RotateCcw className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </Part>
  );
}

/** What is behind the card: champion art, your banner, or colours only. */
function BackgroundChoice({ style, set, bannerUrl, onBanner, hasSavedBanner }: { style: CardStyle; set: Setter; bannerUrl: string | null; onBanner: (b: BannerDraft, source?: CardStyle["art"]["source"]) => void; hasSavedBanner: boolean }) {
  const [preparing, setPreparing] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const art = style.art;
  const pickFile = async (f: File | null) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setPreparing(true);
    try {
      const dataUrl = await prepareBanner(f);
      onBanner({ kind: "new", dataUrl }, "banner");
    } catch (err) {
      toast.error((err as Error).message || "That file could not be read as an image.");
    } finally {
      setPreparing(false);
    }
  };
  return (
    <div className="space-y-3">
      <Choice label="Background" value={art.source} options={ART_SOURCES} labels={{ champion: "Champion art", banner: "My banner", none: "Colours only" }} onChange={(v) => set((s) => ({ ...s, art: { ...s.art, source: v } }))} columns={3} />
      {art.source === "banner" ? (
        <div className="space-y-2" data-testid="banner-panel">
          <p className="text-xs text-fg-muted">{`A landscape picture of your own (PNG, JPEG or WebP), resized in your browser before upload. Shown to teammates, and ${ON_THE_PUBLIC_PAGE}. If it cannot be shown, your champion art is used.`}</p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} data-testid="banner-file" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={preparing}>
              <ImagePlus className="h-4 w-4" /> {preparing ? "Preparing…" : bannerUrl ? "Replace banner" : "Upload banner"}
            </Button>
            {bannerUrl ? (
              <Button variant="ghost" size="sm" onClick={() => onBanner(hasSavedBanner ? { kind: "remove" } : { kind: "keep" }, "champion")}>
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

/** Skins shown before "Show all" (the rest load only when asked for). */
const SKINS_AT_FIRST = 12;

/**
 * The champion and skin behind the card. Kept apart from the style (memoised, stable callbacks), so
 * a colour or a slider never re-renders the champion grid or the skins. The chosen champion with
 * Change (the grid opens in place, in the section's own scrolling, never a list inside a list), then
 * the skins as large thumbnails, the first twelve and Show all.
 */
const ArtworkChooser = React.memo(function ArtworkChooser({ championId, skinNum, champions, poolIds, onChampion, onSkin }: { championId: string | null; skinNum: number; champions: PickerChampion[]; poolIds: string[]; onChampion: (id: string) => void; onSkin: (n: number) => void }) {
  const [fetched, setFetched] = React.useState<{ id: string; list: Array<{ num: number; name: string }> } | null>(null);
  // The champion grid is open: at first when none is chosen.
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
    <div className="space-y-4" data-testid="artwork-step">
      {champion && !choosing ? (
        <div className="flex items-center gap-3" data-testid="artwork-champion">
          <ChampionPortrait champion={champion} size="md" className="rounded-lg ring-1 ring-accent" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-fg">{champion.name}</span>
            <span className="block truncate text-xs text-fg-subtle" data-testid="artwork-skin-name">
              {skinName ?? "Default"}
            </span>
          </span>
          <Button size="sm" variant="outline" onClick={() => setChoosing(true)} aria-expanded="false" data-testid="artwork-change-champion">
            Change
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <ChampionGrid
            champions={champions}
            selectedIds={selected}
            onPick={(id) => {
              onChampion(id);
              setChoosing(false);
            }}
            prioritisedIds={pool}
            prioritisedLabel="in your pools"
            maxHeight="auto"
            size="sm"
            testId="customise-champions"
            placeholder="Search any champion…"
            progressive
          />
          {champion ? (
            <Button size="sm" variant="ghost" onClick={() => setChoosing(false)} data-testid="artwork-keep-champion">
              Keep {champion.name}
            </Button>
          ) : null}
        </div>
      )}
      {!championId ? null : skins === null ? (
        <p className="text-sm text-fg-subtle" aria-live="polite">
          Loading skins…
        </p>
      ) : (
        <SkinChooser key={championId} championId={championId} skins={skins} value={skinNum} onChange={onSkin} />
      )}
    </div>
  );
});

/**
 * The artwork choice: one thumbnail per distinct illustration (chromas and duplicate images are
 * left out on the server), default first, searchable by name, the first twelve and Show all (the
 * chosen one always among those shown). A thumbnail whose image cannot load removes its whole option
 * rather than leaving a blank card. Part of the section's own scrolling (no list inside a list).
 */
function SkinChooser({ championId, skins, value, onChange }: { championId: string; skins: Array<{ num: number; name: string }>; value: number; onChange: (num: number) => void }) {
  const [query, setQuery] = React.useState("");
  const [all, setAll] = React.useState(false);
  const [broken, setBroken] = React.useState<Set<number>>(() => new Set());
  const q = query.trim().toLowerCase();
  const matching = skins.filter((s) => !broken.has(s.num) && (!q || s.name.toLowerCase().includes(q) || s.num === 0));
  const first = matching.slice(0, SKINS_AT_FIRST);
  const chosen = matching.find((s) => s.num === value);
  const shown = all || q ? matching : chosen && !first.includes(chosen) ? [...first.slice(0, -1), chosen] : first;
  return (
    <div className="space-y-2">
      {skins.length > 6 ? <SearchInput value={query} onChange={setQuery} placeholder={`Search ${skins.length - 1} skins…`} label="Search skins" testId="skin-search" /> : null}
      <ul role="radiogroup" aria-label="Skin artwork" className="grid grid-cols-3 gap-2 min-[480px]:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]" data-testid="skin-options">
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
                <span className={cn("block truncate px-1.5 py-1.5 text-xs", on ? "font-semibold text-fg" : "text-fg-muted")}>{s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!all && !q && matching.length > SKINS_AT_FIRST ? (
        <Button size="sm" variant="ghost" onClick={() => setAll(true)} data-testid="skins-show-all">
          Show all {matching.length} skins
        </Button>
      ) : null}
      {q && matching.length <= 1 ? <p className="text-xs text-fg-subtle">No skin matches “{query}”.</p> : null}
      <p className="text-xs text-fg-subtle">Any skin may be shown; it does not mean you own it.</p>
    </div>
  );
}

// ── Identity and socials ────────────────────────────────────────────────────────────────────────

function IdentityPanel({ style, saved, set, change, problem }: { style: CardStyle; saved: CardStyle; set: Setter; change: Change; problem: string | null }) {
  const id = style.identity;
  const mark = React.useContext(BurstContext);
  const [text, setText] = React.useState(id.tagline);
  // Reset, Undo or a preset changed the tagline: show the saved text (typing keeps its own spaces).
  if (cleanTagline(text) !== id.tagline) setText(id.tagline);
  const changed = id.tagline !== saved.identity.tagline || id.emblem !== saved.identity.emblem || id.nameStyle !== saved.identity.nameStyle;
  return (
    <Part title="Identity" changed={changed} onRevert={() => change((d) => ({ ...d, style: { ...d.style, identity: { ...d.style.identity, tagline: saved.identity.tagline, emblem: saved.identity.emblem, nameStyle: saved.identity.nameStyle } } }))}>
      <div className="space-y-5">
        <Field label="Tagline" hint={`optional · ${TAGLINE_MAX} characters`} changed={id.tagline !== ""} onReset={() => set((s) => ({ ...s, identity: { ...s.identity, tagline: "" } }))} testId="field-tagline">
          <input
            type="text"
            value={text}
            maxLength={TAGLINE_MAX + 10}
            onChange={(e) => {
              setText(e.target.value);
              mark("tagline");
              set((s) => ({ ...s, identity: { ...s.identity, tagline: cleanTagline(e.target.value) } }));
            }}
            placeholder="In your own words, e.g. “Calm in the chaos”"
            enterKeyHint="done"
            className="h-11 w-full rounded-lg border border-border bg-bg-elevated px-3 text-base text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none sm:h-10 sm:pointer-fine:text-sm pointer-coarse:h-11"
            aria-describedby="tagline-help"
            data-testid="tagline-input"
          />
          <div id="tagline-help" className="flex justify-between gap-2 text-xs">
            <span className={problem ? "text-bad" : "text-fg-subtle"} data-testid="tagline-problem">
              {problem ?? "Plain text. Ranks and titles come from Riot data."}
            </span>
            <span className="shrink-0 tabular-nums text-fg-subtle">
              {[...id.tagline].length}/{TAGLINE_MAX}
            </span>
          </div>
        </Field>
        <Field label="Emblem" hint="beside your name" changed={id.emblem !== null} onReset={() => set((s) => ({ ...s, identity: { ...s.identity, emblem: null } }))}>
          <div role="radiogroup" aria-label="Emblem" className="grid grid-cols-6 gap-1.5 sm:grid-cols-9 xl:grid-cols-[repeat(13,minmax(0,1fr))]" data-testid="emblem-options">
            <button type="button" role="radio" aria-checked={id.emblem === null} onClick={() => set((s) => ({ ...s, identity: { ...s.identity, emblem: null } }))} className={cn("grid h-10 place-items-center rounded-lg border text-xs pointer-coarse:h-11", id.emblem === null ? "border-accent font-semibold text-fg" : "border-border text-fg-muted hover:text-fg")}>
              None
            </button>
            {CARD_EMBLEMS.map((e) => {
              const Icon = EMBLEM_ICONS[e];
              return (
                <button key={e} type="button" role="radio" aria-checked={id.emblem === e} aria-label={emblemName(e)} title={emblemName(e)} onClick={() => set((s) => ({ ...s, identity: { ...s.identity, emblem: e } }))} className={cn("grid h-10 place-items-center rounded-lg border pointer-coarse:h-11", id.emblem === e ? "border-accent text-accent ring-1 ring-accent" : "border-border text-fg-muted hover:text-fg")} data-value={e}>
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Name style" changed={id.nameStyle !== D.identity.nameStyle} onReset={() => set((s) => ({ ...s, identity: { ...s.identity, nameStyle: D.identity.nameStyle } }))}>
          <Choice label="Name style" value={id.nameStyle} options={NAME_STYLES} labels={{ standard: "Standard", bold: "Bold", wide: "Wide caps", italic: "Italic" }} onChange={(v) => set((s) => ({ ...s, identity: { ...s.identity, nameStyle: v } }))} />
        </Field>
      </div>
    </Part>
  );
}

/**
 * Your YouTube, Twitch and Discord, each with its Show publicly switch: the same links (and the same
 * checks) as Settings → Profile, saved with the card. The previews' icons follow them as you type.
 */
function LinksPanel({ state, onChange }: { state: LinksState; onChange: (kind: SocialKind, patch: Partial<SocialDraft[SocialKind]>) => void }) {
  return (
    <div className="space-y-3" data-testid="studio-links">
      <p className="text-xs text-fg-subtle">A link stays private until you switch on Show publicly: then teammates and visitors to the public team page see it.</p>
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
