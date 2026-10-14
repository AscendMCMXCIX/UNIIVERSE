import { redirect } from "next/navigation";

/** Solo Queue Blocks moved into My Profile; old links keep working. */
export default async function OldBlocksRedirect({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  redirect(q ? `/overview/blocks?${q}` : "/overview/blocks");
}
