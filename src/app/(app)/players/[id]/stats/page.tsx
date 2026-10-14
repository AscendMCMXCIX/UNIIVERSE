import { redirect } from "next/navigation";

/** Season statistics now live on the profile itself; old links land there with their filters. */
export default async function PlayerStatsRedirect({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  redirect(`/players/${id}${q ? `?${q}` : ""}`);
}
