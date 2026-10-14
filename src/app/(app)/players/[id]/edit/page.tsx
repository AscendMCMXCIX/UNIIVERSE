import { redirect } from "next/navigation";

/** Editing now happens on the profile itself (inline, with autosave); old links land there. */
export default async function EditPlayerRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/players/${id}/champions`);
}
