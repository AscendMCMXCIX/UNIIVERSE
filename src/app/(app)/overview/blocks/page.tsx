import { redirect } from "next/navigation";

/** Solo Queue Blocks has its own page now; old links keep working. */
export default async function OldBlocksRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  redirect(q ? `/blocks?${q}` : "/blocks");
}
