"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { PickerChampion } from "@/components/champions/types";
import type { Role } from "@/domain/roles";
import { ProfileEditor } from "@/components/profile/profile-editor";

/**
 * Roles & champion pools. A pool champion opens All Champions with its preview open, in the role of
 * the pool it sits in and this page's season, mode and account (one place and one behaviour for a
 * champion: CM AC-9). Each card is a link to that address, so it works before the page is
 * interactive and opens in a new tab. The editor itself is unchanged: dragging reorders, × removes,
 * Add adds. Without permission to see the player's statistics, the cards stay names only.
 */
export function ProfilePools({ editor, championsPath, championsScope, inspect }: { editor: Omit<React.ComponentProps<typeof ProfileEditor>, "onInspect" | "inspectHref" | "champions"> & { champions: PickerChampion[] }; /** All Champions, and this page's scope (season, mode, account) as a query. */ championsPath: string; championsScope: string; inspect: boolean }) {
  const router = useRouter();
  const championsHref = (championId: string, role: Role) => {
    const q = new URLSearchParams(championsScope);
    q.set("champion", championId);
    q.set("crole", role);
    return `${championsPath}?${q.toString()}`;
  };
  return <ProfileEditor {...editor} onInspect={inspect ? (id, role) => router.push(championsHref(id, role)) : undefined} inspectHref={inspect ? championsHref : undefined} />;
}
