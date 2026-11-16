"use client";

import * as React from "react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { ROLE_ICON_URLS } from "@/domain/role-icons";
import { cn } from "@/lib/cn";

/*
  Position icons. Riot's own position icons (the ones League's client shows in champion select)
  are drawn as a mask in the current text colour as soon as the browser has them; until then, or
  if they cannot be reached, built-in SVGs drawn after Riot's shapes stand in. One component, so
  every screen shows the same icon at the same size.
*/

/** Built-in shapes after Riot's position icons: map-corner brackets for the lanes, a fang for Jungle, a winged crest for Support. */
const GLYPHS: Record<Role, React.ReactNode> = {
  TOP: (
    <>
      <path d="M2 2h15.5l-4 4H6v7.5l-4 4V2z" fill="currentColor" />
      <path d="M22 6.5V22H6.5l4-4H18v-7.5l4-4z" fill="currentColor" opacity="0.32" />
      <rect x="10" y="10" width="4" height="4" fill="currentColor" opacity="0.32" />
    </>
  ),
  JUNGLE: (
    <>
      <path d="M13.2 1.8c-.3 4.1-1.6 7-3 9.6-1 1.8-1.3 3.8-.7 5.8.5 1.6 1.5 3 2.9 4.1-.1-2.4.5-4.5 1.7-6.5 1.5-2.6 1.9-5.4 1.2-8.2-.4-1.7-1.1-3.3-2.1-4.8z" fill="currentColor" />
      <path d="M4.6 6.6c.2 2.9.9 5 2.1 6.8.8 1.2 1.1 2.6.9 4.1-.1.8-.3 1.5-.7 2.2C5 18.2 3.8 16.3 3.5 14c-.4-2.6.1-5.1 1.1-7.4zM19.4 6.6c1 2.3 1.5 4.8 1.1 7.4-.3 2.3-1.5 4.2-3.4 5.7-.4-.7-.6-1.4-.7-2.2-.2-1.5.1-2.9.9-4.1 1.2-1.8 1.9-3.9 2.1-6.8z" fill="currentColor" opacity="0.85" />
    </>
  ),
  MID: (
    <>
      <path d="M2 2h7L2 9V2zM22 22h-7l7-7v7z" fill="currentColor" opacity="0.32" />
      <path d="M22 2v5.5L7.5 22H2v-5.5L16.5 2H22z" fill="currentColor" />
    </>
  ),
  ADC: (
    <>
      <path d="M22 22H6.5l4-4H18v-7.5l4-4V22z" fill="currentColor" />
      <path d="M2 17.5V2h15.5l-4 4H6v7.5l-4 4z" fill="currentColor" opacity="0.32" />
      <rect x="10" y="10" width="4" height="4" fill="currentColor" opacity="0.32" />
    </>
  ),
  SUPPORT: (
    <>
      <path d="M12 3.2l2.6 3.3L12 10.4 9.4 6.5 12 3.2z" fill="currentColor" />
      <path d="M1.5 7.8h6.3l2.6 3.9-1.8 2.4H5.8l1.6-2.2-5.9-4.1zM22.5 7.8h-6.3l-2.6 3.9 1.8 2.4h2.8l-1.6-2.2 5.9-4.1z" fill="currentColor" />
      <path d="M12 12.2l2.2 2.9L12 21.5l-2.2-6.4 2.2-2.9z" fill="currentColor" opacity="0.75" />
    </>
  ),
};

/** Which official icons have loaded in this browser (shared by every icon on the page). */
const loaded = new Map<string, boolean>();
const waiting = new Map<string, Set<() => void>>();

/** Loads `url` once per page and tells `notify` when it has loaded or failed. Returns the unsubscribe. */
function watchIcon(url: string, notify: () => void): () => void {
  if (loaded.has(url)) return () => {};
  let set = waiting.get(url);
  if (!set) {
    set = new Set();
    waiting.set(url, set);
    const img = new Image();
    const settle = (ok: boolean) => {
      loaded.set(url, ok);
      for (const cb of waiting.get(url) ?? []) cb();
      waiting.delete(url);
    };
    img.onload = () => settle(img.naturalWidth > 0);
    img.onerror = () => settle(false);
    img.src = url;
  }
  set.add(notify);
  return () => void waiting.get(url)?.delete(notify);
}

/**
 * Whether the browser has Riot's icon. The server, and the browser while it hydrates the server's
 * HTML, always answer no: a part of the page that streams in after another part's icons loaded
 * would otherwise hydrate a mask where the server sent the built-in shape, and React would throw
 * that whole part away and draw it again. The official icon replaces the shape right after.
 */
function useOfficialIcon(url: string): boolean {
  const subscribe = React.useCallback((notify: () => void) => watchIcon(url, notify), [url]);
  return React.useSyncExternalStore(subscribe, () => loaded.get(url) === true, () => false);
}

/** `decorative`: the role's name is written beside the icon, so the icon has no name of its own (no second "Top" for screen readers, tooltips or the text). */
export function RoleIcon({ role, className, title, decorative = false }: { role: Role; className?: string; title?: string; decorative?: boolean }) {
  const label = title ?? ROLE_LABELS[role];
  const official = useOfficialIcon(ROLE_ICON_URLS[role]);
  const named = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label };
  if (official) {
    const url = ROLE_ICON_URLS[role];
    return <span {...named} title={decorative ? undefined : label} data-role-icon={role} className={cn("inline-block h-4 w-4 shrink-0 bg-current", className)} style={{ maskImage: `url(${url})`, WebkitMaskImage: `url(${url})`, maskSize: "contain", WebkitMaskSize: "contain", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat", maskPosition: "center", WebkitMaskPosition: "center" }} />;
  }
  return (
    <svg viewBox="0 0 24 24" {...named} data-role-icon={role} className={cn("h-4 w-4 shrink-0", className)}>
      {decorative ? null : <title>{label}</title>}
      {GLYPHS[role]}
    </svg>
  );
}

/** The role's icon and name. In a row too narrow for it (with `min-w-0`), the name ends in an ellipsis rather than spilling out. */
export function RoleTag({ role, className, short = false }: { role: Role; className?: string; short?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium text-fg-muted", className)}>
      <RoleIcon role={role} className="h-3.5 w-3.5" />
      <span className="truncate">{short ? role : ROLE_LABELS[role]}</span>
    </span>
  );
}
