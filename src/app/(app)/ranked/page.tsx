import { redirect } from "next/navigation";

/** The ranked journal is Ranked Development now; old links keep working. */
export default function RankedRedirect() {
  redirect("/overview/development");
}
