import { PageNotFound } from "@/components/ui/page-error";

/** A player, block or scout that does not exist (or no longer does), inside the app shell. */
export default function AppNotFound() {
  return <PageNotFound back={{ href: "/team", label: "Go to Team" }} />;
}
