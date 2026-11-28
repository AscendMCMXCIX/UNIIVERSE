"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { isPlainClick } from "@/lib/back-to-top";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
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
 * The section an address change shows (pure: Back, Forward, a soft navigation; for its unit test):
 * null where the address is another page's (`pathname` is not the one this workspace rendered for:
 * Back is leaving the page, which is not a section's to decide) or names the section shown already.
 */
export function addressTarget(at: { pathname: string; rendered: string; search: string; ids: readonly string[]; param?: string; current: string }): string | null {
  if (at.pathname !== at.rendered) return null;
  const to = sectionFromSearch(at.search, at.ids, at.param);
  return to === at.current ? null : to;
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

/** The rail's link: quiet text, the current one in the main ink on a raised surface with the accent's edge (a selected row's). */
const RAIL_LINK = "relative flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-colors duration-150 pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

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
}) {
  const own = useWorkspaceMarks();
  const marks = given ?? own;
  const ids = React.useMemo(() => sections.map((s) => s.id), [sections]);
  // The address as Next holds it (the server's request on the first paint, then every push, Back and soft navigation).
  const search = useSearchParams();
  const pathname = usePathname() || "/";
  const address = search ? sectionFromSearch(search.toString(), ids, param) : null;
  const [chosen, setChosen] = React.useState(() => address ?? initialSection(initial, ids));
  const current = ids.includes(chosen) ? chosen : (ids[0] ?? "");
  const latest = React.useRef({ ids, current, sections, pathname });
  React.useLayoutEffect(() => {
    latest.current = { ids, current, sections, pathname };
  });
  const sectionsRef = React.useRef<HTMLDivElement>(null);
  const focusAfter = React.useRef<string | null>(null);
  // A section's beforeLeave is deciding a Back or a Forward: the address waits for its answer.
  const deciding = React.useRef(false);
  const wrapperOf = (id: string) => sectionsRef.current?.querySelector<HTMLElement>(`[data-ws-section="${CSS.escape(id)}"]`) ?? null;

  // The address, followed: as the page mounts (a page restored by Back may name a section the server did not render), and
  // whenever Next's address changes (a soft navigation to this page with another query keeps it mounted). The window's own
  // address is read, not the render's, so an address a refused Back has already put back is never shown in passing.
  React.useLayoutEffect(() => {
    if (deciding.current) return;
    const { ids: now, current: shown, pathname: rendered } = latest.current;
    const to = addressTarget({ pathname: window.location.pathname, rendered, search: window.location.search, ids: now, param, current: shown });
    if (to !== null) setChosen(to);
  }, [address, param]);

  // Back and Forward within the page: the section the address names, asked first of the section being left.
  React.useEffect(() => {
    const onPop = () => {
      const { ids: now, current: from, sections: list, pathname: rendered } = latest.current;
      const to = addressTarget({ pathname: window.location.pathname, rendered, search: window.location.search, ids: now, param, current: from });
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
  }, [param]);

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
    // An entry of its own, as a section tab's: Back returns to the section before.
    window.history.pushState(null, "", sectionHref(here(), id, latest.current.ids, param));
    focusAfter.current = id;
    setChosen(id);
  };

  // A link's own address (before the page's code runs, or opened in a new tab): the page's path with the section; a plain click keeps the rest of the query.
  const linkHref = (id: string) => sectionHref(pathname, id, ids, param);

  return (
    <WorkspaceMarksProvider marks={marks}>
      <div className={cn("@container/ws ws:flex ws:flex-1 ws:flex-row ws:items-stretch ws:gap-5 ws:space-y-0", className)} data-testid={testId} data-section={marks.workspace ? current : undefined} {...marks.attrs}>
        {index ? <div className="ws:hidden">{index}</div> : null}
        <nav aria-label={label} className={cn("hidden ws:flex ws:w-56 ws:shrink-0 ws:flex-col ws:gap-4", railClassName)} data-testid={`${testId}-rail`}>
          <ul className="flex flex-col gap-0.5">
            {sections.map((s) => {
              const on = s.id === current;
              const m = s.marker;
              return (
                <li key={s.id}>
                  <a
                    href={linkHref(s.id)}
                    onClick={(e) => void choose(e, s.id)}
                    aria-current={on ? "page" : undefined}
                    className={cn(RAIL_LINK, on ? "bg-surface-2 font-semibold text-fg before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent" : "font-medium text-fg-muted hover:bg-surface-2/60 hover:text-fg")}
                    data-testid={`${testId}-link`}
                    data-target={s.id}
                  >
                    <span className="min-w-0 flex-1">{s.title}</span>
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
        <div ref={sectionsRef} className={cn("min-w-0 ws:flex ws:min-w-0 ws:flex-1 ws:flex-col", sectionsClassName)}>
          {sections.map((s) => (
            <div key={s.id} className={cn(s.className, "ws:flex-1 ws:flex-col", s.id === current ? "ws:flex" : "ws:hidden")} data-ws-section={s.id} data-current={s.id === current || undefined}>
              {s.content}
            </div>
          ))}
        </div>
      </div>
    </WorkspaceMarksProvider>
  );
}
