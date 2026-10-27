import { redirect } from "next/navigation";

export default async function RankedBlockRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/overview/development/sessions/${encodeURIComponent(id)}`);
}
