import { redirect } from "next/navigation";
import { getSession } from "./session";
import { hasPermission, type Permission, type Session } from "./permissions";

/**
 * Page guard: signed in and holding at least one of the permissions. A page a user may not open
 * shows the "no access" page instead (navigation already hides it; this is the server check).
 */
export async function requirePageAccess(...anyOf: Permission[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (anyOf.length > 0 && !anyOf.some((p) => hasPermission(session, p))) redirect("/no-access");
  return session;
}
