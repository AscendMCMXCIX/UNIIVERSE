import { after } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getAuthState } from "@/server/auth/session";
import { canWatchFreshness } from "@/server/auth/permissions";
import { developmentFreshness, freshness } from "@/server/ops/freshness";
import { refreshPlayerAccountsIfDue } from "@/server/accounts/kickoff";
import { SESSION_REFRESH_AFTER_MS } from "@/domain/account-status";
import { parseScope } from "@/domain/freshness";

export const dynamic = "force-dynamic";

/**
 * The version of the data an open page shows (domain/freshness.ts), for that page to tell whether
 * it should be read again. Signed in, with the same access as the page (canWatchFreshness). Never
 * cached, and the version itself never calls Riot. One exception starts a read of Riot, after the
 * answer is sent: a player watching their own Ranked Development while a session runs gets their
 * accounts read again once five minutes have passed since the last read (the visit refresh's own
 * lease and budget), so the game they just finished joins the session without a reload.
 */
export async function GET(request: Request) {
  const scope = parseScope(new URL(request.url).searchParams.get("scope"));
  if (!scope) return Response.json({ error: "Unknown scope" }, { status: 400 });
  const db = await getAppDb();
  const { session } = await getAuthState(db);
  if (!session) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!canWatchFreshness(session, scope)) return Response.json({ error: "Not allowed" }, { status: 403 });
  if (scope.kind === "development") {
    const { freshness: version, sessionActive } = await developmentFreshness(db, scope.playerId);
    if (sessionActive) after(() => refreshPlayerAccountsIfDue(db, scope.playerId, { refreshAfterMs: SESSION_REFRESH_AFTER_MS }));
    return Response.json(version, { headers: { "Cache-Control": "private, no-store" } });
  }
  return Response.json(await freshness(db, scope), { headers: { "Cache-Control": "private, no-store" } });
}
