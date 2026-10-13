import { getAuthState, ROLE_LABELS_USER } from "@/server/auth/session";
import { defaultPlatform } from "@/server/auth/signup";
import { completeSetupAction } from "@/server/actions/auth";
import { getAppDb } from "@/server/bootstrap";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { getValidInvite } from "@/server/repositories/users";
import { InviteForm } from "./invite-form";
import { SetupForm } from "@/components/auth/setup-form";
import { BrandFrame } from "@/components/auth/brand-frame";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getAppDb();
  const [invite, auth] = await Promise.all([getValidInvite(db, token), getAuthState(db)]);
  if (invite?.userId) {
    // An account the admin created: nothing to type twice, just roles, champions and a password.
    const [team, champions, player] = await Promise.all([getOrCreateTeam(db), listChampions(db), invite.playerId ? getPlayer(db, invite.playerId) : Promise.resolve(null)]);
    return (
      <BrandFrame eyebrow="WELCOME TO UNIIVERSE" width="max-w-2xl">
        <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Set up your player profile</h1>
        <p className="mt-2 text-sm text-fg-muted">Choose the role you play, the champions you are ready to draft, and a password for signing in on other devices. Takes about a minute.</p>
        <SetupForm action={completeSetupAction} token={token} username={invite.username ?? player?.displayName ?? ""} riotId={player?.riotId ?? null} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} />
      </BrandFrame>
    );
  }
  return (
    <BrandFrame eyebrow="INVITATION" width="max-w-md">
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Create your UNIIVERSE account</h1>
      {!invite ? (
        <p className="mt-3 text-sm text-bad">This invite link is invalid, already used or expired. Ask the team admin for a new one.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-fg-muted">
            You are invited as <span className="text-fg">{ROLE_LABELS_USER[invite.role]}</span>
            {invite.playerName ? (
              <>
                {" "}and will take over the roster placeholder <span className="text-fg">{invite.playerName}</span>
              </>
            ) : null}
            .{invite.note ? ` ${invite.note}` : ""}
          </p>
          <InviteForm token={token} suggestedUsername={invite.playerName ?? ""} defaultPlatform={defaultPlatform()} existingUser={auth.session?.userId ? { label: auth.session.label, hasPlayer: !!auth.session.playerId } : null} />
        </>
      )}
    </BrandFrame>
  );
}
