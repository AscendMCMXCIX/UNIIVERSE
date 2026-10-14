import { redirect } from "next/navigation";

/** Meta & Trends opens on Solo Queue Meta (older links keep their patch). */
export default async function TrendsIndex({ searchParams }: { searchParams: Promise<{ patch?: string }> }) {
  const { patch } = await searchParams;
  redirect(patch ? `/trends/solo?patch=${encodeURIComponent(patch)}` : "/trends/solo");
}
