import { PageSkeleton } from "@/components/ui/skeleton";

/**
 * Team Insights keeps the app's generic loading state. Without this file the Team Matches list
 * skeleton in ../loading.tsx would stand in for it, since a segment's loading.tsx wraps every route
 * below it.
 */
export default function Loading() {
  return <PageSkeleton />;
}
