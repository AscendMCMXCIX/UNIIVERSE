"use client";

import * as React from "react";
import type { Role } from "@/domain/roles";
import type { CardAccent, CardArt } from "@/domain/player-card";
import type { CardLook } from "@/domain/card-style";

/**
 * What the profile header shows about a player: only display fields (never notes or account
 * details), so it can travel to the browser with every profile page.
 */
export interface HeaderIdentity {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  art: CardArt | null;
  accent: CardAccent;
  /** The personal card look (Player Card Studio). */
  look: CardLook;
  primaryRole: Role | null;
  offRoles: Role[];
  archived: boolean;
  /** The member has not finished first-time setup (a member all the same). */
  setupPending: boolean;
  lineupRole: Role | null;
  rank: { tier: string; division: string | null; leaguePoints: number; wins: number | null; losses: number | null; queue: "solo" | "flex" | null; asOf: string | null } | null;
  /** Champions offered first in the Customise dialog (the player's pools). */
  featurable: string[];
}

/*
  Why this exists: a profile's header lives in its layout, and Next.js keeps a visited layout in
  the browser and reuses it when you come back to that profile; only the tab below it is fetched
  again. So a teammate who changed their card (artwork, accent, picture) still looked unchanged
  in the header for whoever had opened the profile before. Every tab now carries the player's
  current identity and hands it to the header, which shows the newest one.
*/
const Ctx = React.createContext<{ identity: HeaderIdentity; set: (next: HeaderIdentity) => void } | null>(null);

export function ProfileIdentityProvider({ initial, children }: { initial: HeaderIdentity; children: React.ReactNode }) {
  const [identity, setIdentity] = React.useState(initial);
  // A layout rendered afresh (a full load, or a refresh after your own save) wins too.
  const initialKey = JSON.stringify(initial);
  const [seen, setSeen] = React.useState(initialKey);
  if (seen !== initialKey) {
    setSeen(initialKey);
    setIdentity(initial);
  }
  const set = React.useCallback((next: HeaderIdentity) => setIdentity((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next)), []);
  const value = React.useMemo(() => ({ identity, set }), [identity, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Rendered by every profile tab with the identity it was just served. */
export function ProfileIdentitySync({ identity }: { identity: HeaderIdentity }) {
  const ctx = React.useContext(Ctx);
  const set = ctx?.set;
  React.useEffect(() => {
    set?.(identity);
  }, [set, identity]);
  return null;
}

export function useHeaderIdentity(fallback: HeaderIdentity): HeaderIdentity {
  return React.useContext(Ctx)?.identity ?? fallback;
}
