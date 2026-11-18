"use client";

import { usePathname } from "next/navigation";
import { PageSkeleton } from "@/components/ui/skeleton";
import { pageWidthOf } from "@/lib/nav";

/*
  Sits above a profile's layout on purpose. Links to profiles (Team, Players) prefetch everything
  down to the first loading boundary and the browser keeps that prefetch for minutes; with the
  boundary below the layout, the prefetched part included the profile header (artwork, picture,
  accent), so a teammate saw the old look after a change. Here, only this skeleton is prefetched
  and the header always comes fresh with the page. It stands in for Players (one of Team's
  sections, wide) and for a teammate's profile (the ordinary width): it takes the width of the page
  being opened (pageWidthOf).
*/
export default function Loading() {
  return <PageSkeleton panels={4} width={pageWidthOf(usePathname())} />;
}
