"use client";

import { usePathname } from "next/navigation";
import { PlayersSkeleton, ProfileSkeleton } from "@/components/ui/skeleton";

/*
  Sits above a profile's layout on purpose. Links to profiles (Team, Players) prefetch everything
  down to the first loading boundary and the browser keeps that prefetch for minutes; with the
  boundary below the layout, the prefetched part included the profile header (artwork, picture,
  accent), so a teammate saw the old look after a change. Here, only this skeleton is prefetched
  and the header always comes fresh with the page. It stands in for Players (its rows) and for a
  teammate's profile (the header, the tabs and the section opened), each in its page's shape
  (skeleton.tsx), so nothing jumps when the page arrives.
*/
export default function Loading() {
  const pathname = usePathname();
  if (pathname === "/players") return <PlayersSkeleton />;
  const section = pathname.split("/")[3];
  return <ProfileSkeleton section={section === "champions" || section === "matches" || section === "accounts" ? section : "overview"} />;
}
