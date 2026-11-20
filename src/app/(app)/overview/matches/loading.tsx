import { HistorySkeleton } from "@/components/ui/skeleton";

/** Match History while it loads, under the profile's header and tabs, in its own shape (skeleton.tsx). */
export default function Loading() {
  return <HistorySkeleton />;
}
