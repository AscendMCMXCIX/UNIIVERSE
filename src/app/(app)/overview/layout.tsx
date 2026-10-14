import Link from "next/link";
import { after } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { refreshPlayerAccountsIfDue } from "@/server/accounts/kickoff";
import { ProfileFrame, profileHeader } from "@/components/players/profile-sections";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody } from "@/components/ui/panel";

export const dynamic = "force-dynamic";

/**
 * MY PROFILE: the same profile every teammate sees, opened on your own player and editable here
 * (roles, champion pools, order, card style, Riot accounts).
 */
export default async function MyProfileLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const db = await getAppDb();
  const header = session?.playerId ? await profileHeader(db, session.playerId) : null;
  if (!header) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="My Profile" description="Your roles, rank, champion pools and this season's statistics." />
        <Panel>
          <PanelBody className="text-sm text-fg">
            This account has no player profile yet.{" "}
            <Link href="/me" className="text-accent underline underline-offset-2">
              Complete your profile
            </Link>{" "}
            and come back here.
          </PanelBody>
        </Panel>
      </div>
    );
  }
  // Your Riot data refreshes while you look at it (after the page is sent; never blocks it).
  after(() => refreshPlayerAccountsIfDue(db, header.player.id));
  return (
    <ProfileFrame header={header} session={session} basePath="/overview">
      {children}
    </ProfileFrame>
  );
}
