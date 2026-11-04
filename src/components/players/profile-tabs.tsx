"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { PROFILE_SECTIONS, activeHref } from "@/lib/nav";
import { TabBar } from "@/components/ui/tab-bar";

/** Sections that share the chosen season and game mode when you move between them. */
const KEEPS_SEASON = new Set(["overview", "champions", "matches"]);

/**
 * The profile's sections as a bar fixed under the profile card: Overview | All Champions |
 * Match History | Riot Accounts (PROFILE_SECTIONS). The one list of a profile's sections: the sidebar has a single My Profile
 * link, so the two never repeat each other. It is the same bar as Team's sections (TabBar), on
 * phones too: the tabs scroll sideways there with the current one in view, rather than hiding in
 * a picker. Every entry is a link: Back/Forward, new tabs and the keyboard work, and the page
 * changes without a full reload or a jump to the top.
 */
export function ProfileTabs({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const sections = PROFILE_SECTIONS.map((s) => ({ ...s, href: `${basePath}${s.path}` }));
  const currentHref = activeHref(pathname, sections.map((s) => s.href)) ?? basePath;
  const current = sections.find((s) => s.href === currentHref) ?? sections[0]!;
  const carried = new URLSearchParams();
  if (KEEPS_SEASON.has(current.key)) for (const k of ["season", "mode"]) if (params.get(k)) carried.set(k, params.get(k)!);
  const hrefOf = (s: (typeof sections)[number]) => (KEEPS_SEASON.has(s.key) && carried.size && s.key !== current.key ? `${s.href}?${carried.toString()}` : s.href);
  return <TabBar label="Profile sections" items={sections.map((s) => ({ key: s.key, href: hrefOf(s), label: s.label, icon: s.icon, testId: `profile-tab-${s.key}` }))} current={current.key} keepScroll testId="profile-tabs" />;
}
