"use client";

import { usePathname } from "next/navigation";
import { PageSkeleton } from "@/components/ui/skeleton";
import { pageWidthOf } from "@/lib/nav";

/**
 * The app's loading state, at the width pageWidthOf gives the address being opened: a Team section's
 * own (Team Overview 100rem; Matches 80rem under a 1600px window, 100rem from there), every other page
 * the ordinary 80rem (narrower pages, such as Settings at 48rem, are not told apart).
 */
export default function Loading() {
  return <PageSkeleton width={pageWidthOf(usePathname())} />;
}
