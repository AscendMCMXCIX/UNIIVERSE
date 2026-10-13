import { redirect } from "next/navigation";

/** Player Overview lands here; until it does, the ranked section carries the player's stats. */
export default function OverviewPage() {
  redirect("/ranked");
}
