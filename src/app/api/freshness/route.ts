import { getAppDb } from "@/server/bootstrap";
import { getAuthState } from "@/server/auth/session";
import { canWatchFreshness } from "@/server/auth/permissions";
import { freshness } from "@/server/ops/freshness";
import { parseScope } from "@/domain/freshness";

export const dynamic = "force-dynamic";

/**
 * The version of the data an open page shows (domain/freshness.ts), for that page to tell whether
 * it should be read again. Signed in, with the same access as the page (canWatchFreshness). Never
 * cached, and never calls Riot.
 */
export async function GET(request: Request) {
  const scope = parseScope(new URL(request.url).searchParams.get("scope"));
  if (!scope) return Response.json({ error: "Unknown scope" }, { status: 400 });
  const db = await getAppDb();
  const { session } = await getAuthState(db);
  if (!session) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!canWatchFreshness(session, scope)) return Response.json({ error: "Not allowed" }, { status: 403 });
  return Response.json(await freshness(db, scope), { headers: { "Cache-Control": "private, no-store" } });
}
