import { redirect } from "next/navigation";

/** The Solo Queue Blocks journal moved under Player Overview; old links keep working. */
export default function RankedRedirect() {
  redirect("/overview/blocks");
}
