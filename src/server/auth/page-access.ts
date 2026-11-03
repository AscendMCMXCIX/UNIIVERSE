import { redirect } from "next/navigation";
import { getSession, needsSetup } from "./session";
import { hasPermission, type Permission, type Session } from "./permissions";

/**
 * Page guard: signed in, setup finished, and holding at least one of the permissions. A page a
 * user may not open shows the "no access" page instead (navigation already hides it; this is the
 * server check).
 *
 * Every page calls it itself (src/app/page-guards.test.ts). A layout's check does not protect its
 * pages: Next.js renders a layout and its page at the same time, so a page that skips the check
 * still runs and its data is sent in the response even when the layout redirects.
 */
export async function requirePageAccess(...anyOf: Permission[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (needsSetup(session)) redirect("/welcome");
  if (anyOf.length > 0 && !anyOf.some((p) => hasPermission(session, p))) redirect("/no-access");
  return session;
}
