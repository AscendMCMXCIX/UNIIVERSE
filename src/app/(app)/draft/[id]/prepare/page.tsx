import { redirect } from "next/navigation";

/** Pre-draft preparation (blind bans / scouting). Replaced by the full page in the scouting phase. */
export default async function PreparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/draft/${id}`);
}
