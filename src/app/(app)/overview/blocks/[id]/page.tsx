import { redirect } from "next/navigation";

export default async function OldBlockRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/blocks/${encodeURIComponent(id)}`);
}
