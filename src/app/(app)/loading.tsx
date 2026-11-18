"use client";

import { usePathname } from "next/navigation";
import { PageSkeleton } from "@/components/ui/skeleton";
import { pageWidthOf } from "@/lib/nav";

/** The app's loading state, at the width of the page it stands in for (Team's sections are wide: pageWidthOf). */
export default function Loading() {
  return <PageSkeleton width={pageWidthOf(usePathname())} />;
}
