import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { hasPermission } from "@/server/auth/permissions";
import { currentChampionPrints } from "@/server/clash/prints";

export const dynamic = "force-dynamic";

/**
 * Clash Scout's champion prints for one Data Dragon version and print format (?v=…&f=…): team
 * members only, kept by the browser for a year (a new version or format is a new address).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!hasPermission(session, "view-team")) return new Response("Not found", { status: 404 });
  const params = new URL(request.url).searchParams;
  const version = params.get("v") ?? "";
  const prints = await currentChampionPrints(await getAppDb(), version, Number(params.get("f") ?? 1));
  if (!prints || prints.ids.length === 0) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(prints), { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=31536000, immutable" } });
}
