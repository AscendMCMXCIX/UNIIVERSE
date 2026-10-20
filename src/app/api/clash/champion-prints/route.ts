import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/permissions";
import { currentChampionPrints } from "@/server/clash/prints";

export const dynamic = "force-dynamic";

/** Clash Scout's champion prints for one Data Dragon version (?v=…): team members only, kept by the browser for a year. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!hasPermission(session, "view-team")) return new Response("Not found", { status: 404 });
  const version = new URL(request.url).searchParams.get("v") ?? "";
  const prints = await currentChampionPrints(await getAppDb(), version);
  if (!prints || prints.ids.length === 0) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(prints), { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=31536000, immutable" } });
}
