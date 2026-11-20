import { getAppDb } from "@/server/bootstrap";
import { getAuthState } from "@/server/auth/session";
import { canWatchFreshness } from "@/server/auth/permissions";
import { mayOpenProfile } from "@/server/auth/profile-access";
import { after } from "next/server";
import { freshness, playerFreshnessAndDue } from "@/server/ops/freshness";
import { refreshPlayerAccountsIfDue } from "@/server/accounts/kickoff";
import { parseScope } from "@/domain/freshness";

export const dynamic = "force-dynamic";

/**
 * The version of the data an open page shows (domain/freshness.ts), for that page to tell whether
 * it should be read again. Signed in, with the same access as the page (canWatchFreshness; a
 * personal-use player's only for that player and administrators, mayOpenProfile, answered as any
 * refusal so nothing says the profile exists). Never cached, and never calls Riot while answering.
 *
 * A profile's freshness is asked only by the mounted page (FreshnessWatcher: at once as it mounts,
 * then at its pace), never by a prefetch, so this is where the player's visit refresh starts: after
 * the answer is sent, bounded (refreshPlayerAccountsIfDue), when an account is due or the next slice
 * of a season still filling in can start. The profile's layout used to start it, and a prefetch
 * renders the layout: seeing a teammate's name on Players synced their accounts.
 */
export async function GET(request: Request) {
  const scope = parseScope(new URL(request.url).searchParams.get("scope"));
  if (!scope) return Response.json({ error: "Unknown scope" }, { status: 400 });
  const db = await getAppDb();
  const { session } = await getAuthState(db);
  if (!session) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!canWatchFreshness(session, scope) || (scope.kind === "player" && !(await mayOpenProfile(db, session, scope.playerId)))) return Response.json({ error: "Not allowed" }, { status: 403 });
  if (scope.kind === "player") {
    const { freshness: version, due } = await playerFreshnessAndDue(db, scope.playerId, { visit: true });
    if (due) after(() => refreshPlayerAccountsIfDue(db, scope.playerId));
    return Response.json(version, { headers: { "Cache-Control": "private, no-store" } });
  }
  return Response.json(await freshness(db, scope), { headers: { "Cache-Control": "private, no-store" } });
}
