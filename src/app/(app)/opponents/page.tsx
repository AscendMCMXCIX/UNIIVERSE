import { redirect } from "next/navigation";

/** The opponent-scouting pages were retired; enemy names now live on each game. */
export default function OpponentsPage() {
  redirect("/matches");
}
