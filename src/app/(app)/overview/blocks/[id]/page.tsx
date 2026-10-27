import { redirect } from "next/navigation";

/** A block is a session now (the same record, the same id). */
export default async function OldBlockRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/overview/development/sessions/${encodeURIComponent(id)}`);
}
