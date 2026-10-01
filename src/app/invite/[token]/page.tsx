import { getAuthState, ROLE_LABELS_USER } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getValidInvite } from "@/server/repositories/users";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getAppDb();
  const [invite, auth] = await Promise.all([getValidInvite(db, token), getAuthState(db)]);
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <div className="text-[10px] tracking-[0.35em] text-fg-subtle">INVITATION</div>
        <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">UNIIVERSE</h1>
        {!invite ? (
          <p className="mt-3 text-sm text-bad">This invite link is invalid, already used or expired. Ask the team owner for a new one.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-fg-muted">
              You are invited as <span className="text-fg">{ROLE_LABELS_USER[invite.role]}</span>
              {invite.playerName ? (
                <>
                  {" "}and will claim the player profile <span className="text-fg">{invite.playerName}</span>
                </>
              ) : null}
              .{invite.note ? ` ${invite.note}` : ""}
            </p>
            <InviteForm token={token} suggestedName={invite.playerName ?? ""} suggestedEmail={invite.email ?? ""} existingUser={auth.session?.userId ? { label: auth.session.label, hasPlayer: !!auth.session.playerId } : null} />
          </>
        )}
      </div>
    </main>
  );
}
