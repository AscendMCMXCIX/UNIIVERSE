"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { artPlacement, type ArtPlace, type CardLook } from "@/domain/card-style";
import type { CardArt } from "@/domain/player-card";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import type { SocialLinkView } from "@/domain/social-links";
import type { RosterChampion, RosterSlot } from "@/server/team/roster";
import type { PickerChampion } from "@/components/champions/types";
import { cn } from "@/lib/cn";
import { PAGE_WIDTH } from "@/lib/nav";
import { LineupPreview, playerDetail } from "@/components/team/team-roster";
import { ProfileHeader } from "./profile-header";
import type { HeaderIdentity } from "./profile-identity";
import type { CompactRank } from "./rank-emblem";
import { DIRECTORY_GRID, DIRECTORY_PANEL, RosterRow } from "./roster-row";

/*
  Card Studio's previews. Each one is the page's own component (ProfileHeader, Team's RosterCard laid
  out by LineupPreview, the Players row in its panel, the Peek's hero from playerDetail, the public
  page's card) drawn with the draft look, inside a frame as wide and as tall as the screen it stands
  for: a same-origin <iframe> whose document carries the app's own stylesheets, into which React
  renders the component (a portal). Its media queries, container queries, viewport units and fonts
  are therefore the real screen's, so a phone's header previewed on a desktop is laid out exactly as
  a phone lays it out, and a preview can never drift from the page: there is no copy to drift.

  - Nothing new is downloaded: the stylesheets, fonts and pictures are the page's own addresses,
    already in the browser's cache, and the frame draws only the one context chosen (one artwork).
  - Nothing is requested from the server: the preview renders what the Studio already has.
  - The frame is inert (no focus, nothing read out, no pointer): the Studio's controls and the
    artwork surface over it (ArtSurface) are the ways to change what it shows.
  - The page around the component is the page's frame (the sidebar's width, main's padding, the
    page's width, a phone's bars), from the same classes (MAIN_CLASS below, the app shell's own),
    so the component is exactly as wide, and on a phone's Team page exactly as tall, as on the page.
*/

/** What the player's card really shows, so a preview shows their card rather than a template. */
export interface StudioPreviewData {
  /** The role the card stands in (Team: the lineup role; elsewhere the Primary Role). */
  role: Role | null;
  rank: CompactRank | null;
  /** False: the editor may not see this player's rank (a player manager without "view teammates' statistics"), so the preview leaves it out, never "Unranked". */
  showRank?: boolean;
  status: "main" | "off" | null;
  /** This season in the role (Team has it; the Studio fetches it once where the opener has none). */
  season: NonNullable<RosterSlot["player"]>["season"];
  /** The role's pool, in order (the first few appear on the card). */
  poolIds: string[];
  /** The social links teammates see on the card, as icons (none when left out). */
  social?: readonly SocialLinkView[];
  /** The profile header's roles and status (the header's own fields; derived from `role` when absent). */
  primaryRole?: Role | null;
  offRoles?: readonly Role[];
  lineupRole?: Role | null;
  archived?: boolean;
  setupPending?: boolean;
  /** The pool with this season's figures (Team has them), else `poolIds` without figures. */
  pool?: readonly RosterChampion[];
  seasonLabel?: string;
}

export const PREVIEW_CONTEXTS = ["header", "team", "players", "peek", "public"] as const;
export type PreviewContext = (typeof PREVIEW_CONTEXTS)[number];
export type PreviewDevice = "desktop" | "mobile";

export const CONTEXT_LABEL: Record<PreviewContext, string> = {
  header: "Profile header",
  team: "Team card",
  players: "Players list",
  peek: "Player Peek",
  public: "Public team page",
};

/** Which artwork place each preview shows (null: none there, a phone's Players row carries no art). */
export const CONTEXT_PLACE: Record<PreviewContext, Record<PreviewDevice, ArtPlace | null>> = {
  header: { desktop: "header", mobile: "headerPhone" },
  team: { desktop: "card", mobile: "cardPhone" },
  players: { desktop: "row", mobile: null },
  peek: { desktop: "peek", mobile: "peek" },
  public: { desktop: "card", mobile: "cardPhone" },
};

/** A place as the Studio names it ("Profile header on a phone"). */
export const PLACE_LABEL: Record<ArtPlace, string> = {
  header: "Profile header, desktop",
  headerPhone: "Profile header, phone",
  card: "Team card, desktop",
  cardPhone: "Team card, phone",
  row: "Players list",
  peek: "Player Peek",
};

/**
 * The app shell's <main> (app-shell.tsx), the same classes: its padding, the phone's tab bar room, and
 * the column a page that fills the height gets. studio-preview.test.ts checks they are still the shell's.
 */
export const MAIN_CLASS = "min-w-0 flex-1 px-safe-4 py-5 pb-tabbar outline-none sm:px-safe-6 md:pb-6 lg:px-8 lg:py-7 lg:has-[[data-fills-height]]:flex lg:has-[[data-fills-height]]:flex-col max-sm:has-[[data-fills-height]]:flex max-sm:has-[[data-fills-height]]:flex-col ws-host:flex ws-host:flex-col";
/** The app shell's frame (FRAME): one column, at most --content-wide, centred. */
export const FRAME_CLASS = "mx-auto w-full max-w-[var(--content-wide)] lg:has-[[data-fills-height]]:flex lg:has-[[data-fills-height]]:flex-1 lg:has-[[data-fills-height]]:flex-col max-sm:has-[[data-fills-height]]:flex max-sm:has-[[data-fills-height]]:flex-1 max-sm:has-[[data-fills-height]]:flex-col ws-host:flex ws-host:flex-1 ws-host:flex-col";
/** Team's page around its lineup (app/(app)/team/page.tsx). */
export const TEAM_PAGE_CLASS = "mx-auto flex w-full max-w-[var(--content-wide)] flex-col max-sm:flex-1 lg:flex-1";
/** The public pages' <main> (app/public/layout.tsx). */
export const PUBLIC_MAIN_CLASS = "relative mx-auto flex w-full max-w-[var(--content-wide)] flex-1 flex-col px-safe-4 pb-8 pt-2 sm:px-safe-6 lg:pt-4";
/**
 * A phone's bars above a members' page: the top bar's row (3.25rem), the sections' row under it (44px)
 * and its hairline, 97px on an upright phone at the usual text size (measured on Team at 390 × 844 and
 * 375 × 667, 24 Nov 2026). The tab bar's room is main's own (pb-tabbar).
 */
const PHONE_TOP_BARS = "calc(3.25rem + 45px)";
/** Team's header on a members' phone: one 44px line (PHONE_HEADER in team-roster.tsx). */
const PHONE_TEAM_HEADER = "h-[44px]";
/** The desktop's expanded sidebar (collapsible-sidebar.tsx, w-64), where the Studio cannot measure it. */
const SIDEBAR_REM = 16;

export interface PreviewScreen {
  width: number;
  height: number;
  /** The sidebar's width in px beside a desktop page (0 on a phone). */
  sidebar: number;
}

/**
 * The screen a preview stands for. Desktop: this window when it is one (a laptop or larger, its
 * sidebar as it is now), else 1440 × 900 with the sidebar open. Mobile: this phone when it is one
 * held upright, else 390 × 844 (an iPhone 15).
 */
export function previewScreen(device: PreviewDevice): PreviewScreen {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (device === "desktop") {
    if (w >= 1024 && h > 480) {
      const slot = document.querySelector<HTMLElement>("[data-testid=sidebar-slot]");
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      return { width: w, height: h, sidebar: slot ? slot.getBoundingClientRect().width : SIDEBAR_REM * rootPx };
    }
    return { width: 1440, height: 900, sidebar: SIDEBAR_REM * 16 };
  }
  if (w < 640 && h > 480) return { width: w, height: h, sidebar: 0 };
  return { width: 390, height: 844, sidebar: 0 };
}

/** Everything a preview draws: the player, the draft look and the page data the Studio has. */
export interface PreviewSubject {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  art: CardArt | null;
  look: CardLook;
  data: StudioPreviewData | null;
  champions: PickerChampion[];
  /** The public team page shows Riot data (rank, season figures and the pool's figures): PUBLIC_RIOT_DATA on the server. */
  publicFigures?: boolean;
  /** The viewer's own card: "You", and Customise on the Team card (the profile header shows Customise to anyone who may edit the card, as the Studio's opener may). */
  own: boolean;
}

const EMPTY_FIGURES = { games: 0, wins: 0, losses: 0, winRate: null, kdaRatio: null, perfectKda: false, csPerMinute: null, visionPerGame: null, masteryPoints: null, tier: "", tierLabel: "", tierWhy: "", evidence: "none", lastPlayedAt: null } as const;

/**
 * The player as one Team slot (what Team's card and the Peek are drawn from). `publicPage`: as the
 * public page builds it (server/public/team.ts, publicCard): the rank, the season and the pool's
 * figures only where the team shows Riot data publicly.
 */
export function previewSlot(s: PreviewSubject, publicPage = false): RosterSlot {
  const d = publicPage && !s.publicFigures && s.data ? { ...s.data, rank: null, season: null, pool: undefined, showRank: false, seasonLabel: "" } : s.data;
  const role: Role = d?.role ?? d?.primaryRole ?? "MID";
  // Main or Off Role on the card comes from the Primary Role: off, another role (the player's own where known).
  const primaryRole: Role = d?.status === "off" ? (d.primaryRole && d.primaryRole !== role ? d.primaryRole : (ROLES.find((r) => r !== role) ?? role)) : role;
  const champions: RosterChampion[] = d?.pool ? [...d.pool] : (d?.poolIds ?? []).map((championId) => ({ championId, ...EMPTY_FIGURES }));
  const statsVisible = publicPage ? !!s.publicFigures : (d?.showRank ?? true);
  return {
    role,
    roleLabel: ROLE_LABELS[role],
    player: {
      id: s.playerId,
      name: s.name,
      avatarUrl: s.avatarUrl,
      rank: d?.rank ?? null,
      profileRole: primaryRole === role ? "primary" : "secondary",
      substitute: false,
      poolSlot: null,
      profile: { primaryRole, secondaryRole: null, primaryPool: [], secondaryPool: [], additionalRoles: [] },
      version: "",
      seasonLabel: d?.seasonLabel ?? "This season",
      partial: false,
      primaryRole,
      art: s.art,
      poolIds: d?.poolIds ?? [],
      cardAccent: "default",
      look: s.look,
      social: [...(d?.social ?? [])],
      season: d?.season ?? null,
      rankChange: null,
      statsVisible,
    },
    champions,
    candidates: [],
    waiting: [],
    suggestions: [],
    substitute: null,
    substituteCandidates: [],
  };
}

/** The player as the profile header's identity. */
export function previewIdentity(s: PreviewSubject): HeaderIdentity {
  const d = s.data;
  const rank = d?.rank ?? null;
  return {
    playerId: s.playerId,
    displayName: s.name,
    avatarUrl: s.avatarUrl,
    art: s.art,
    accent: "default",
    look: s.look,
    primaryRole: d?.primaryRole !== undefined ? d.primaryRole : (d?.role ?? null),
    offRoles: [...(d?.offRoles ?? [])],
    archived: d?.archived ?? false,
    setupPending: d?.setupPending ?? false,
    lineupRole: d?.lineupRole ?? null,
    showRank: d?.showRank ?? true,
    rank: rank ? { ...rank, asOf: null } : null,
    featurable: d?.poolIds ?? [],
    social: [...(d?.social ?? [])],
  };
}

/** The page around a member's component: the sidebar's room and main's padding on a desktop, the bars on a phone. */
function MemberPage({ device, screen, width, children }: { device: PreviewDevice; screen: PreviewScreen; /** The page's own width (the profile and Players: 80rem); none for Team, which takes the frame. */ width?: "max"; children: React.ReactNode }) {
  const page = width ? <div className={cn("mx-auto w-full", PAGE_WIDTH[width])}>{children}</div> : children;
  if (device === "mobile")
    return (
      <div className="flex min-h-dvh flex-col">
        <div aria-hidden className="shrink-0" style={{ height: PHONE_TOP_BARS }} />
        <main className={MAIN_CLASS}>
          <div className={FRAME_CLASS}>{page}</div>
        </main>
      </div>
    );
  return (
    <div className="flex min-h-dvh">
      <div aria-hidden className="shrink-0" style={{ width: screen.sidebar }} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <main className={MAIN_CLASS}>
          <div className={FRAME_CLASS}>{page}</div>
        </main>
      </div>
    </div>
  );
}

/** One preview's content, the page's own component with the draft look; `data-preview-target` marks what is shown. */
export function PreviewContent({ context, device, screen, subject }: { context: PreviewContext; device: PreviewDevice; screen: PreviewScreen; subject: PreviewSubject }) {
  switch (context) {
    case "header":
      return (
        <MemberPage device={device} screen={screen} width="max">
          <div data-preview-target>
            <ProfileHeader preview identity={previewIdentity(subject)} self={subject.own} editable champions={subject.champions} />
          </div>
        </MemberPage>
      );
    case "team":
      return (
        <MemberPage device={device} screen={screen}>
          <div className={TEAM_PAGE_CLASS}>
            <LineupPreview slot={previewSlot(subject)} champions={subject.champions} own={subject.own} fill header={<div aria-hidden className={cn(PHONE_TEAM_HEADER, "lg:hidden")} />} />
          </div>
        </MemberPage>
      );
    case "public":
      return (
        <div className="flex min-h-dvh flex-col">
          {/* The public header's line (logo and links) above the page. */}
          <div aria-hidden className="h-[3.75rem] shrink-0" />
          <main className={PUBLIC_MAIN_CLASS}>
            <div className="flex w-full flex-col lg:flex-1">
              <LineupPreview slot={previewSlot(subject, true)} champions={subject.champions} guest fill />
            </div>
          </main>
        </div>
      );
    case "players": {
      const slot = previewSlot(subject);
      const d = subject.data;
      const byId = new Map(subject.champions.map((c) => [c.id, c]));
      const pool = (d?.poolIds ?? []).map((id) => byId.get(id) ?? { id, name: id, portraitUrl: "" });
      const role = d?.primaryRole !== undefined ? d.primaryRole : (d?.role ?? null);
      return (
        <MemberPage device={device} screen={screen} width="max">
          <div className={DIRECTORY_PANEL} data-preview-target>
            <ol className={DIRECTORY_GRID} aria-label="Players">
              <RosterRow look={subject.look} art={subject.art} name={subject.name} avatarUrl={subject.avatarUrl} role={role} offRoles={d?.offRoles ?? []} rank={slot.player!.rank} showRank={slot.player!.statsVisible} riot={null} pool={pool} poolLabel={role ? `${ROLE_LABELS[role]} champions` : "Champions"} lineupRole={d?.lineupRole ?? null} setupPending={d?.setupPending} archived={d?.archived} isYou={subject.own} social={d?.social} />
            </ol>
          </div>
        </MemberPage>
      );
    }
    case "peek": {
      const slot = previewSlot(subject);
      const detail = playerDetail({ slot, championsById: new Map(subject.champions.map((c) => [c.id, c])), canEdit: false, canViewProfile: true, profileHref: subject.own ? "/overview" : `/players/${subject.playerId}`, editHref: "/overview", position: `1 of 5 in the lineup` });
      // Desktops: the docked panel (peek.tsx: clamp(26rem, 34vw, 36rem) at the window's right, its hero as tall as its content);
      // phones: the window over the whole screen, its hero at least 11rem under the window's controls.
      return device === "desktop" ? (
        <div className="flex min-h-dvh items-start justify-end">
          <div className="w-[clamp(26rem,34vw,36rem)] border-l border-border bg-bg-elevated [--modal-clear-top:2.5rem] [--peek-hero-min:0rem]" data-preview-target>
            {detail.hero}
          </div>
        </div>
      ) : (
        // The phone's window: the whole screen inside its hairlines, its controls' row 64px tall (the Peek's --modal-clear-top there).
        <div className="min-h-dvh border-x border-border bg-bg-elevated [--modal-clear-top:4rem]">
          <div data-preview-target>{detail.hero}</div>
        </div>
      );
    }
  }
}

/**
 * A frame of `screen`'s size whose document carries the app's stylesheets, with `children` rendered
 * into it (a portal). Calls `onTarget` with the shown element ([data-preview-target], else the first
 * card) whenever its size changes.
 */
export function PreviewFrame({ screen, title, children, onTarget, className, style, testId = "studio-preview-frame" }: { screen: PreviewScreen; title: string; children: React.ReactNode; onTarget: (target: HTMLElement | null) => void; className?: string; style?: React.CSSProperties; testId?: string }) {
  const ref = React.useRef<HTMLIFrameElement>(null);
  const [mount, setMount] = React.useState<HTMLElement | null>(null);
  const onTargetRef = React.useRef(onTarget);
  React.useLayoutEffect(() => {
    onTargetRef.current = onTarget;
  });

  React.useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: MutationObserver | null = null;
    const setUp = () => {
      const doc = frame.contentDocument;
      if (!doc || doc.body.dataset.ready) return;
      doc.body.dataset.ready = "true";
      // The page's look: the root's classes and variables (fonts, Branding's colours), and every stylesheet.
      const html = document.documentElement;
      doc.documentElement.className = html.className;
      doc.documentElement.setAttribute("style", html.getAttribute("style") ?? "");
      doc.documentElement.lang = html.lang;
      for (const a of html.getAttributeNames()) if (a.startsWith("data-")) doc.documentElement.setAttribute(a, html.getAttribute(a)!);
      doc.body.className = document.body.className;
      doc.body.style.margin = "0";
      doc.body.setAttribute("inert", "");
      const copies = new Map<Node, Node>();
      const copy = (n: Node) => {
        if (!(n instanceof HTMLElement) || copies.has(n)) return;
        if (!(n.tagName === "STYLE" || (n.tagName === "LINK" && (n as HTMLLinkElement).rel === "stylesheet"))) return;
        const c = n.cloneNode(true);
        copies.set(n, c);
        doc.head.appendChild(c);
      };
      document.head.querySelectorAll("style, link[rel=stylesheet]").forEach(copy);
      // Stylesheets that arrive later (a part of the page loaded on demand) follow.
      observer = new MutationObserver((records) => {
        for (const r of records) {
          r.addedNodes.forEach(copy);
          r.removedNodes.forEach((n) => {
            const c = copies.get(n);
            if (c) (c as ChildNode).remove();
            copies.delete(n);
          });
        }
      });
      observer.observe(document.head, { childList: true });
      const root = doc.createElement("div");
      root.id = "preview-root";
      doc.body.appendChild(root);
      setMount(root);
    };
    if (frame.contentDocument?.readyState === "complete" && frame.contentDocument.body) setUp();
    frame.addEventListener("load", setUp);
    return () => {
      frame.removeEventListener("load", setUp);
      observer?.disconnect();
    };
  }, []);

  // The shown element's size, from the frame's own ResizeObserver.
  React.useEffect(() => {
    if (!mount) return;
    const win = mount.ownerDocument.defaultView as (Window & typeof globalThis) | null;
    if (!win) return;
    let target: HTMLElement | null = null;
    // The Players row itself (not its panel's other columns), else the marked element, else the card.
    const find = () => mount.querySelector<HTMLElement>("[data-preview-target] [data-testid=roster-row-preview]") ?? mount.querySelector<HTMLElement>("[data-preview-target]") ?? mount.querySelector<HTMLElement>("article");
    const report = () => onTargetRef.current(find());
    const ro = new win.ResizeObserver(report);
    const mo = new win.MutationObserver(() => {
      const next = find();
      if (next !== target) {
        if (target) ro.unobserve(target);
        target = next;
        if (target) ro.observe(target);
      }
      report();
    });
    mo.observe(mount, { childList: true, subtree: true, attributes: true });
    target = find();
    if (target) ro.observe(target);
    ro.observe(mount);
    report();
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [mount]);

  return (
    <>
      <iframe
        ref={ref}
        title={title}
        srcDoc='<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'
        tabIndex={-1}
        aria-hidden
        className={cn("pointer-events-none absolute left-0 top-0 origin-top-left border-0 bg-transparent", className)}
        style={{ width: screen.width, height: screen.height, colorScheme: "dark", ...style }}
        data-testid={testId}
        data-width={screen.width}
        data-height={screen.height}
      />
      {mount ? createPortal(children, mount) : null}
    </>
  );
}

/** Where the artwork's box (the crop) is within the shown element, and the picture's own proportions, for the surface over it. */
export interface ArtBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The picture's natural width ÷ height (Data Dragon's splash, 1215 × 717, until it has loaded). */
  ratio: number;
  src: string | null;
}

/** The artwork's box inside `target` for `place` (its art layer; the Players row's strip). */
export function artBoxOf(target: HTMLElement | null): ArtBox | null {
  if (!target) return null;
  const layer = target.querySelector<HTMLElement>("[data-art-layer]") ?? target.querySelector<HTMLElement>("[data-row-art]");
  if (!layer) return null;
  const t = target.getBoundingClientRect();
  const r = layer.getBoundingClientRect();
  const img = layer.querySelector<HTMLImageElement>("img");
  const ratio = img && img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1215 / 717;
  return { left: r.left - t.left, top: r.top - t.top, width: r.width, height: r.height, ratio, src: img?.currentSrc || img?.src || null };
}

/** The current framing for a place, as the surface edits it. */
export function placementFor(look: CardLook, place: ArtPlace) {
  return artPlacement(look.style, place);
}
