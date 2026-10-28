import { redirect } from "next/navigation";

/** Solo Queue Blocks became Ranked Development's sessions; old links keep working. */
export default async function OldBlocksRedirect({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { add } = await searchParams;
  redirect(add === "1" ? "/overview/development/sessions#add-game" : "/overview/development/sessions");
}
