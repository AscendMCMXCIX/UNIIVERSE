import { getSession, hasPermission } from "@/server/auth/session";
import { defaultPlatform } from "@/server/auth/signup";
import { getAppDb } from "@/server/bootstrap";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam, getPlayer } from "@/server/repositories/team";
import { PlayerEditor } from "@/components/team/player-editor";
import { RiotAccountsPanel } from "@/components/team/riot-accounts-panel";
import { PlayerDataPanel } from "@/components/team/player-data-panel";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { getPlayerDataReport } from "@/server/proficiency/provenance";
import { ChangePasswordPanel } from "@/components/settings/change-password-panel";
import { CompleteProfileForm } from "@/components/auth/complete-profile-form";
import { OnboardingChecklist, type ChecklistItem } from "@/components/auth/onboarding-checklist";

export const dynamic = "force-dynamic";

/** A teammate's own profile: roles, pools, Riot accounts and data, password. */
export default async function MePage() {
  const session = await getSession();
  const db = await getAppDb();
  const [team, champions] = await Promise.all([getOrCreateTeam(db), listChampions(db)]);
  const player = session?.playerId ? await getPlayer(db, session.playerId) : null;
  const riotConfigured = !!process.env.RIOT_API_KEY;
  const [accounts, report] = player ? await Promise.all([listAccountsForPlayer(db, player.id), getPlayerDataReport(db, player, { riotConfigured })]) : [[], null];
  const platform = defaultPlatform();
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const poolSize = player ? player.primaryPool.length + player.secondaryPool.length : 0;
  const checklist: ChecklistItem[] | null =
    session?.userId && player
      ? [
          { key: "account", done: true, title: "Account and player profile created", detail: `@${session.username ?? session.label} · ${player.displayName}` },
          {
            key: "riot",
            done: !!report && report.accounts.length > 0 && report.summary.state !== "error",
            title: report && report.accounts.length === 0 ? "Link your Riot account" : report?.summary.state === "error" ? "Fix your Riot account link" : report?.summary.state === "synced" ? "Riot account connected and synced" : "Riot account connected (verification pending)",
            detail: report && report.accounts.length > 0 ? report.accounts.map((a) => `${a.riotId}: ${a.sync.label.toLowerCase()}`).join(" · ") : "Needed for proficiency data.",
            href: "#riot-accounts",
          },
          { key: "pools", done: poolSize >= 3, title: poolSize >= 3 ? "Champion pools set" : "Add your champion pools", detail: poolSize >= 3 ? `${player.primaryPool.length} primary · ${player.secondaryPool.length} secondary` : "Up to six champions for your main role and three for your off-role. Only pool champions are ever recommended.", href: "#profile" },
          { key: "password", done: session.hasPassword, title: session.hasPassword ? "Password set" : "Set a password", detail: session.hasPassword ? "You can sign in from any device." : "Without one you can only use this device until the session expires.", href: "#password" },
          { key: "data", done: !!report?.hasData, title: report?.hasData ? "Proficiency data available" : "Proficiency data arrives after the first sync", detail: report?.hasData ? `${report.championsWithData} champions with data · ${report.gamesAnalysed} games analysed` : "Usually within a few minutes of linking an account; then refreshed every few hours.", href: "#riot-data" },
        ]
      : null;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {checklist ? <OnboardingChecklist items={checklist} /> : null}
      {session?.userId && !session.hasPassword ? (
        <div id="password">
          <ChangePasswordPanel hasPassword={false} />
        </div>
      ) : null}
      {player ? (
        <>
          <div id="profile">
            <PlayerEditor player={player} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl, isNew: c.isNew }))} limits={team.poolLimits} canDelete={false} selfService={!hasPermission(session, "manage-players")} />
          </div>
          <div id="riot-accounts">
            <RiotAccountsPanel playerId={player.id} accounts={accounts} riotConfigured={riotConfigured} defaultPlatform={platform} />
          </div>
          {report ? (
            <div id="riot-data">
              <PlayerDataPanel report={report} championsById={championsById} playerName={player.displayName} selfView />
            </div>
          ) : null}
        </>
      ) : session?.userId ? (
        <CompleteProfileForm defaultPlatform={platform} />
      ) : null}
      {session?.userId && session.hasPassword ? (
        <div id="password">
          <ChangePasswordPanel hasPassword />
        </div>
      ) : null}
    </div>
  );
}
