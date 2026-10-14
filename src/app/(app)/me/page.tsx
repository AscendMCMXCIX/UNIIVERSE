import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { getViewMode } from "@/server/auth/view-mode";
import { defaultPlatform } from "@/server/auth/signup";
import { ChangePasswordPanel } from "@/components/settings/change-password-panel";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";

export const dynamic = "force-dynamic";

/** "My profile" is the member's own player profile. An account from before automatic profiles finishes its profile here first. */
export default async function MePage() {
  const session = await getSession();
  if ((await getViewMode(session)) === "admin") redirect("/admin");
  if (session?.playerId) redirect(`/players/${session.playerId}`);
  if (!session?.userId) redirect("/");
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">My profile</h1>
        <p className="text-sm text-fg-muted">Your account has no player profile yet. Add your Riot ID and main role once; roles and champion pools are edited on the profile afterwards.</p>
      </div>
      {!session.hasPassword ? <ChangePasswordPanel hasPassword={false} /> : null}
      <CompleteProfileForm defaultPlatform={defaultPlatform()} />
    </div>
  );
}
