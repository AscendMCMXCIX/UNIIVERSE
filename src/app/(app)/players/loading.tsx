import { PageSkeleton } from "@/components/ui/skeleton";

/*
  Sits above a profile's layout on purpose. Links to profiles (Team, Players) prefetch everything
  down to the first loading boundary and the browser keeps that prefetch for minutes; with the
  boundary below the layout, the prefetched part included the profile header (artwork, picture,
  accent), so a teammate saw the old look after a change. Here, only this skeleton is prefetched
  and the header always comes fresh with the page.
*/
export default function Loading() {
  return <PageSkeleton panels={4} />;
}
