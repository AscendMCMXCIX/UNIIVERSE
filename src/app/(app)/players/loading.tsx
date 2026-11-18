"use client";

import { usePathname } from "next/navigation";
import { PageSkeleton } from "@/components/ui/skeleton";
import { pageWidthOf } from "@/lib/nav";

/*
  Sits above a profile's layout on purpose. Links to profiles (Team, Players) prefetch everything
  down to the first loading boundary and the browser keeps that prefetch for minutes; with the
  boundary below the layout, the prefetched part included the profile header (artwork, picture,
  accent), so a teammate saw the old look after a change. Here, only this skeleton is prefetched
  and the header always comes fresh with the page. It stands in for Players (80rem under a 1600px
  window, Team's 100rem from there) and for a teammate's profile (the ordinary 80rem): it takes the
  width pageWidthOf gives the address being opened.
*/
export default function Loading() {
  return <PageSkeleton panels={4} width={pageWidthOf(usePathname())} />;
}
