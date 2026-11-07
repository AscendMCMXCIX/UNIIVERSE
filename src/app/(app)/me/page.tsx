import { redirect } from "next/navigation";
import { defaultPlatform } from "@/server/auth/signup";
import { ChangePasswordPanel } from "@/components/settings/change-password-panel";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";
import { requirePageAccess } from "@/server/auth/page-access";
import { isOwner } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/**
 * "My profile" is the member's own player profile. The Owner's account without one (from before
 * automatic profiles, or after a recovery) finishes it here; any other account without one gets it
 * from an administrator (actions/users.ts, completeProfileAction).
 */
export default async function MePage() {
  const session = await requirePageAccess();
  if (session.playerId) redirect(`/players/${session.playerId}`);
  const owner = isOwner(session);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold">My profile</h1>
        <p className="text-sm text-fg-muted">
          {owner ? "Your account has no player profile yet. Add your Riot ID and main role once; roles and champion pools are edited on the profile afterwards." : "This account has no player profile. Player profiles are created by an administrator, together with the account."}
        </p>
      </div>
      {!session.hasPassword ? <ChangePasswordPanel hasPassword={false} /> : null}
      {owner ? <CompleteProfileForm defaultPlatform={defaultPlatform()} /> : null}
    </div>
  );
}
