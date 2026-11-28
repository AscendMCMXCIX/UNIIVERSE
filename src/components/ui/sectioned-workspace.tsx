"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { isPlainClick } from "@/lib/back-to-top";
import { cn, withDefaults } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { subTabClass } from "./sub-tabs";
import { itemHref, itemIn } from "./address-item";
import { WorkspaceMarksProvider, useWorkspaceMarks, type WorkspaceMarks } from "./workspace";

/*
  A sectioned workspace (docs/RESPONSIVE.md, "One-screen desktop pages", pattern b): a long page of
  sections (a form's panels, an admin page's parts) as one screen on a desktop window. In the
  workspace (the platform's gate, ui/workspace.tsx) a rail of the sections' links stands at the left,
  with a slot for the page's actions under them, and the current section fills the frame beside it;
  outside the gate (phones, tablets, touch, short or narrow windows, a larger text size) every section
  is stacked as before, with the page's own index (`index`), and the rail is not drawn.

  The current section is in the address (`?section=<id>`; the first section has none), so a link to
  a section opens it, a refresh keeps it, and each switch is an entry of its own, as the section tabs'
  are: Back goes to the section before, Forward returns. An unknown or missing value is the first
  section. The rail's entries are plain links (they work before the page's code has run: the server
  renders the page's own ?section=, read through useSearchParams, or `initial` where there is none).
  The section shown follows the address whatever changes it: the rail, Back and Forward, and a soft
  navigation to the page with another query (the account menu's Settings link on /settings?section=x:
  Next keeps the page mounted, so the address, not the mount, decides). A Back that leaves the page is
  the page's own (its unsaved-changes guard), never a section's: nothing here runs for it.

  Every section stays mounted (the others hidden in the workspace only), so what is typed in one
  survives a switch to another. A section may ask before it is left (`beforeLeave`: an editor with
  unsaved changes asks whether to leave them): a refusal keeps it, and Back's address is put back.
  A section's marker in the rail says it holds unsaved changes, an error, or a count.

  The switch the reader makes moves the focus to the section (as an in-page link's jump does:
  jumpToAnchor), so a screen reader lands in it; Back and Forward leave the focus where it is.
*/

/** A section of a sectioned workspace. */
export interface WorkspaceSectionItem {
  /** Its address (?section=) and its key: letters, digits and dashes. */
  id: string;
  /** Its name in the rail. */
  title: string;
  content: React.ReactNode;
  /** The rail's marker: unsaved changes, an error, a count (an admin queue's). */
  marker?: { unsaved?: boolean; error?: boolean; count?: number | null };
  /** Asked before the section is left: false keeps it (an editor with unsaved changes). */
  beforeLeave?: () => boolean | Promise<boolean>;
  /** The section's own wrapper classes (in both postures). */
  className?: string;
}

/** The section the address names: the id after `param` where it is one of `ids`, else the first. */
export function sectionFromSearch(search: string, ids: readonly string[], param = "section"): string {
  const at = itemIn(search, param);
  return at !== null && ids.includes(at) ? at : (ids[0] ?? "");
}

/** `href` with the section in `param`, or without it for the first section (its address is the page's own). */
export function sectionHref(href: string, id: string, ids: readonly string[], param = "section"): string {
  return itemHref(href, param, id === ids[0] || !ids.includes(id) ? null : id);
}

/** The section shown first: `initial` where it is one of `ids`, else the first. */
export function initialSection(initial: string | null | undefined, ids: readonly string[]): string {
  return initial && ids.includes(initial) ? initial : (ids[0] ?? "");
}

const here = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

/**
 * The section an address change shows (pure: Back, Forward, a soft navigation; for its unit test).
 * The section ?section= names; else the one holding the hash's element (`hashSection`: an old deep
 * link, /settings#password, names its panel); else the first. null where the address is another
 * page's (`pathname` is not the one this workspace rendered for: Back is leaving the page, which is
 * not a section's to decide) or names the section shown already; null too for an in-page fragment
 * link (the skip link's #content: the query the workspace last followed, `followed`, unchanged, and a
 * hash naming no section's element, `hashOutside`), which names a place, not a section: the section
 * shown stays, wherever it came from. An empty hash is no such link (Back to /settings: the first).
 */
export function addressTarget(at: { pathname: string; rendered: string; search: string; ids: readonly string[]; param?: string; current: string; hashSection?: string | null; followed?: string | null; hashOutside?: boolean }): string | null {
  if (at.pathname !== at.rendered) return null;
  if (at.hashOutside && at.followed != null && at.search === at.followed) return null;
  const named = itemIn(at.search, at.param ?? "section");
  const to = named !== null && at.ids.includes(named) ? named : at.hashSection && at.ids.includes(at.hashSection) ? at.hashSection : (at.ids[0] ?? "");
  return to === at.current ? null : to;
}

/** The section holding the element the address's hash names (inside `root`), or null; `outside`: a hash that names no section's element (the skip link's #content, the notice's #compliance). */
function hashIn(root: HTMLElement | null): { section: string | null; outside: boolean } {
  const hash = window.location.hash.slice(1);
  if (!hash || !root) return { section: null, outside: false };
  let id = hash;
  try {
    id = decodeURIComponent(hash);
  } catch {}
  const target = document.getElementById(id);
  const holder = target && root.contains(target) ? target.closest<HTMLElement>("[data-ws-section]") : null;
  const section = holder?.dataset.wsSection ?? null;
  return { section, outside: section === null };
}

type Marker = NonNullable<WorkspaceSectionItem["marker"]>;

/** A section's marker: its own (the page's) with what its fields report (useSectionMarker), unsaved or in error where any is. */
export function mergedMarker(own: Marker | undefined, reported: readonly Marker[]): Marker | undefined {
  if (!reported.length) return own;
  return { ...own, unsaved: !!own?.unsaved || reported.some((m) => m.unsaved), error: !!own?.error || reported.some((m) => m.error) };
}

interface SectionsValue {
  sections: readonly WorkspaceSectionItem[];
  current: string;
  workspace: boolean;
  label: string;
  testId: string;
  rootRef: React.RefObject<HTMLDivElement | null>;
  choose: (e: React.MouseEvent<HTMLAnchorElement>, id: string) => void;
  linkHref: (id: string) => string;
  markerOf: (id: string) => Marker | undefined;
  report: (section: string, from: string, marker: Marker | null) => void;
}

const SectionsContext = React.createContext<SectionsValue | null>(null);
const SectionIdContext = React.createContext<string | null>(null);

/**
 * A field's state for its section's marker in the rail (a draft not saved, an error shown): called
 * by an editor inside a section's content, it is a no-op anywhere else (the flow's pages that hold
 * the same editor: the welcome step, Previews).
 */
export function useSectionMarker(marker: { unsaved?: boolean; error?: boolean }) {
  const ctx = React.useContext(SectionsContext);
  const section = React.useContext(SectionIdContext);
  const from = React.useId();
  const report = ctx?.report;
  const { unsaved = false, error = false } = marker;
  React.useEffect(() => {
    if (!report || !section) return;
    report(section, from, unsaved || error ? { unsaved, error } : null);
    return () => report(section, from, null);
  }, [report, section, from, unsaved, error]);
}

/** Focuses a section's wrapper as an in-page link's jump does: tabindex -1 only until it loses the focus, so a click inside never focuses it. */
function focusSection(el: HTMLElement | null) {
  if (!el) return;
  if (!el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1");
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
  }
  el.focus({ preventScroll: true });
}

/*
  The rail's links are a section's views (docs/DESIGN_SYSTEM.md §5, "Text-led controls", the secondary
  level, as the in-page indexes it stands in for: Settings'): words, the current one in the main ink,
  semibold, over the 2px accent line inside its box; no fill and no ring (subTabClass). One a line, each
  as wide as its words (the line under them, not across the rail).
*/

export function SectionedWorkspace({
  sections,
  initial = null,
  param = "section",
  label,
  index,
  actions,
  marks: given,
  className,
  sectionsClassName,
  railClassName,
  testId = "sectioned-workspace",
  short = false,
  children,
}: {
  sections: readonly WorkspaceSectionItem[];
  /** The section to show first where the address cannot be read (outside Next's router: a unit test's render); the page's own ?section= otherwise. */
  initial?: string | null;
  /** The query parameter: "section" by default. */
  param?: string;
  /** The rail's name for screen readers ("Settings sections"). */
  label: string;
  /** The flow's own index of the sections (SectionIndex), drawn outside the workspace only. */
  index?: React.ReactNode;
  /** The page's actions, under the rail's links (the workspace only). */
  actions?: React.ReactNode;
  /** The page's own useWorkspaceMarks; else the gate read here. */
  marks?: WorkspaceMarks;
  /** The whole's classes in both postures (the flow's spacing). */
  className?: string;
  /** The sections' column's classes (the flow's spacing between sections). */
  sectionsClassName?: string;
  railClassName?: string;
  testId?: string;
  /** Opts in to the workspace's short form (ws-short: classes; useWorkspaceMarks' `short`), where `marks` is not given. */
  short?: boolean;
  /**
   * The page's own layout of the rail and the sections (a rail inside a card of its own: Settings'
   * account card), in place of the default row: it places <SectionRail /> and <SectionPanels />
   * where it wants them (server markup between them is fine). `index` and `actions` are then the
   * page's to place too. The whole keeps `className` only (and the container `ws`).
   */
  children?: React.ReactNode;
}) {
  const own = useWorkspaceMarks({ short });
  const marks = given ?? own;
  const ids = React.useMemo(() => sections.map((s) => s.id), [sections]);
  // The address as Next holds it (the server's request on the first paint, then every push, Back and soft navigation: a
  // new object for each new address, the hash's included).
  const search = useSearchParams();
  const pathname = usePathname() || "/";
  const address = search ? sectionFromSearch(search.toString(), ids, param) : null;
  const [chosen, setChosen] = React.useState(() => address ?? initialSection(initial, ids));
  const current = ids.includes(chosen) ? chosen : (ids[0] ?? "");
  const latest = React.useRef({ ids, current, sections, pathname });
  React.useLayoutEffect(() => {
    latest.current = { ids, current, sections, pathname };
  });
  // The whole (its sections' wrappers are found in it, wherever the page's own layout puts them).
  const rootRef = React.useRef<HTMLDivElement>(null);
  const focusAfter = React.useRef<string | null>(null);
  // A section's beforeLeave is deciding a Back or a Forward: the address waits for its answer.
  const deciding = React.useRef(false);
  const wrapperOf = (id: string) => rootRef.current?.querySelector<HTMLElement>(`[data-ws-section="${CSS.escape(id)}"]`) ?? null;
  // The query last followed: an in-page fragment link (the skip link) keeps it, and names no section.
  const followed = React.useRef<string | null>(null);
  // The window's address as a section (null: another page's, the section shown, or an in-page fragment link).
  const target = React.useCallback((from: string) => {
    const { ids: now, pathname: rendered } = latest.current;
    const hash = hashIn(rootRef.current);
    const to = addressTarget({ pathname: window.location.pathname, rendered, search: window.location.search, ids: now, param, current: from, hashSection: hash.section, hashOutside: hash.outside, followed: followed.current });
    if (window.location.pathname === rendered) followed.current = window.location.search;
    return to;
  }, [param]);

  // The address, followed: as the page mounts (a page restored by Back may name a section the server did not render; an
  // old deep link's hash names a panel), and whenever Next's address changes (a soft navigation to this page with another
  // query keeps it mounted). The window's own address is read, not the render's, so an address a refused Back has already
  // put back is never shown in passing.
  React.useLayoutEffect(() => {
    if (deciding.current) return;
    const to = target(latest.current.current);
    if (to !== null) setChosen(to);
  }, [search, target]);

  // Back and Forward within the page: the section the address names, asked first of the section being left.
  React.useEffect(() => {
    const onPop = () => {
      const { current: from, sections: list } = latest.current;
      const to = target(from);
      if (to === null) return;
      const guard = list.find((s) => s.id === from)?.beforeLeave;
      if (!guard) return setChosen(to);
      deciding.current = true;
      void Promise.resolve(guard()).then((ok) => {
        deciding.current = false;
        if (ok) setChosen(to);
        // Kept: the address names the section shown again (this page's address: Back stayed on it).
        else window.history.pushState(null, "", sectionHref(here(), from, latest.current.ids, param));
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [param, target]);

  // A section the hash alone holds (an old deep link to a panel: the shell's /settings#password nudge, /admin/system#compliance)
  // is written into the query once it is shown in the workspace (/settings?section=password#password), so from then on the
  // query holds it, as a rail switch's does: an in-page fragment link (the skip link's #content) keeps the query, and a
  // refresh shows the section. In place (replaceState: no entry of its own), through Next's router, which keeps
  // useSearchParams in step; on the next task, since on the first paint the router's own effect that follows replaceState
  // runs after this one. The flow (every section stacked) keeps its hash links' addresses as they are.
  const paged = marks.paged;
  React.useEffect(() => {
    if (!paged) return;
    const timer = window.setTimeout(() => {
      const { ids: now, current: shown, pathname: rendered } = latest.current;
      if (window.location.pathname !== rendered || shown === now[0]) return;
      const named = itemIn(window.location.search, param);
      if (named !== null && now.includes(named)) return;
      if (hashIn(rootRef.current).section !== shown) return;
      window.history.replaceState(null, "", sectionHref(here(), shown, now, param));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [paged, current, search, param]);

  // The section the reader switched to takes the focus once drawn.
  React.useLayoutEffect(() => {
    const id = focusAfter.current;
    if (!id || id !== current) return;
    focusAfter.current = null;
    focusSection(wrapperOf(id));
  });

  const choose = async (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    // A click that asks for another tab or window is the browser's.
    if (!isPlainClick(e)) return;
    e.preventDefault();
    const from = latest.current.current;
    if (id === from) return focusSection(wrapperOf(id));
    const guard = sections.find((s) => s.id === from)?.beforeLeave;
    if (guard && !(await guard())) return;
    // An entry of its own, as a section tab's: Back returns to the section before. The hash goes (an old deep link's
    // panel, the notice's anchor): the section is in the query.
    window.history.pushState(null, "", sectionHref(`${window.location.pathname}${window.location.search}`, id, latest.current.ids, param));
    focusAfter.current = id;
    setChosen(id);
  };

  // A link's own address (before the page's code runs, or opened in a new tab): the page's path with the section; a plain click keeps the rest of the query.
  const linkHref = React.useCallback((id: string) => sectionHref(pathname, id, ids, param), [pathname, ids, param]);

  // What the sections' fields report (useSectionMarker), by section and by field.
  const [reported, setReported] = React.useState<Record<string, Record<string, Marker>>>({});
  const report = React.useCallback((section: string, from: string, marker: Marker | null) => {
    setReported((all) => {
      const was = all[section]?.[from];
      if (!marker && !was) return all;
      if (marker && was && was.unsaved === marker.unsaved && was.error === marker.error) return all;
      const next = { ...(all[section] ?? {}) };
      if (marker) next[from] = marker;
      else delete next[from];
      return { ...all, [section]: next };
    });
  }, []);
  const markerOf = (id: string) => mergedMarker(sections.find((s) => s.id === id)?.marker, Object.values(reported[id] ?? {}));

  const value: SectionsValue = { sections, current, workspace: marks.workspace, label, testId, rootRef, choose: (e, id) => void choose(e, id), linkHref, markerOf, report };
  const whole = { "data-testid": testId, "data-section": marks.workspace ? current : undefined, ...marks.attrs };

  return (
    <WorkspaceMarksProvider marks={marks}>
      <SectionsContext.Provider value={value}>
        {children !== undefined ? (
          <div ref={rootRef} className={cn("@container/ws", className)} {...whole}>
            {children}
          </div>
        ) : (
          <div ref={rootRef} className={cn("@container/ws ws:flex ws:flex-1 ws:flex-row ws:items-stretch ws:gap-5 ws:space-y-0", className)} {...whole}>
            {index ? <div className="ws:hidden">{index}</div> : null}
            {/* The page's rail classes replace the default width (withDefaults), not stack on it. */}
            <SectionRail className={withDefaults("ws:w-56 ws:shrink-0", railClassName)} actions={actions} />
            <SectionPanels className={sectionsClassName} />
          </div>
        )}
      </SectionsContext.Provider>
    </WorkspaceMarksProvider>
  );
}

function useSections(what: string): SectionsValue {
  const ctx = React.useContext(SectionsContext);
  if (!ctx) throw new Error(`${what} is drawn inside a SectionedWorkspace`);
  return ctx;
}

/**
 * The rail: the sections' links (the current one marked, each marker read out), then `actions`.
 * Drawn in the workspace only. Inside a SectionedWorkspace: by default it draws one; a page with its
 * own layout (children) places this one where it wants it.
 */
export function SectionRail({ className, actions, linkClassName }: { className?: string; actions?: React.ReactNode; /** The links' own spacing (a rail inside a card). */ linkClassName?: string }) {
  const { sections, current, label, testId, choose, linkHref, markerOf } = useSections("SectionRail");
  return (
    <nav aria-label={label} className={cn("hidden ws:flex ws:flex-col ws:gap-4", className)} data-testid={`${testId}-rail`}>
      <ul className="flex flex-col items-start gap-0.5">
        {sections.map((s) => {
          const on = s.id === current;
          const m = markerOf(s.id);
          return (
            <li key={s.id}>
              <a
                href={linkHref(s.id)}
                onClick={(e) => choose(e, s.id)}
                aria-current={on ? "page" : undefined}
                className={subTabClass(on, cn("text-left", linkClassName))}
                data-testid={`${testId}-link`}
                data-target={s.id}
              >
                <span className="min-w-0">{s.title}</span>
                {m?.error ? (
                  <>
                    <AlertCircle className="h-4 w-4 shrink-0 text-bad" aria-hidden data-testid={`${testId}-error`} />
                    <span className="sr-only">, has an error</span>
                  </>
                ) : null}
                {m?.unsaved ? (
                  <>
                    <span className="h-2 w-2 shrink-0 rounded-full bg-warn" aria-hidden data-testid={`${testId}-unsaved`} />
                    <span className="sr-only">, unsaved changes</span>
                  </>
                ) : null}
                {typeof m?.count === "number" ? (
                  <span className="shrink-0 text-xs tabular-nums text-fg-subtle" data-testid={`${testId}-count`}>
                    {formatCount(m.count)}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
      {actions ? <div className="mt-auto flex flex-col gap-2" data-testid={`${testId}-actions`}>{actions}</div> : null}
    </nav>
  );
}

/**
 * The sections, every one mounted, the current one shown in the workspace and the others hidden there
 * only (all stacked in the flow). `only`: these sections alone, for a page whose flow puts others
 * between them (System Health's "Technical details" fold round four of its sections), in the order
 * given; every section is drawn by exactly one SectionPanels.
 */
export function SectionPanels({ className, only }: { className?: string; only?: readonly string[] }) {
  const { sections: all, current } = useSections("SectionPanels");
  const sections = only ? only.flatMap((id) => all.filter((s) => s.id === id)) : all;
  return (
    <div className={cn("min-w-0 ws:flex ws:min-w-0 ws:flex-1 ws:flex-col", className)}>
      {sections.map((s) => (
        <div key={s.id} className={cn(s.className, "ws:flex-1 ws:flex-col", s.id === current ? "ws:flex" : "ws:hidden")} data-ws-section={s.id} data-current={s.id === current || undefined}>
          <SectionIdContext.Provider value={s.id}>{s.content}</SectionIdContext.Provider>
        </div>
      ))}
    </div>
  );
}
