import Link from "next/link";
import type { Metadata } from "next";
import { BrandFrame } from "@/components/auth/brand-frame";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy" };

/** The date this notice last changed; update it with the text. */
const UPDATED = "21 October 2026";

/** What the app stores, from the database schema (docs/UNIIVERSE_TECHNICAL_HANDOVER.md): who sees it and how long it stays. */
const STORED: Array<{ what: string; why: string; who: string; kept: string }> = [
  {
    what: "Your account: username, display name, access level, last sign-in, and your password as a scrypt hash (never the password itself)",
    why: "Signing in and deciding what you may do",
    who: "Team members see your display name; administrators see accounts",
    kept: "Until an administrator deletes the account",
  },
  {
    what: "Sign-in sessions: a hash of the session token, your browser's name and version, and when the session started and was last used",
    why: "Keeping you signed in for 24 hours",
    who: "Nobody in the app",
    kept: "Signing out deletes it at once. Otherwise a session ends 24 hours after signing in and is deleted automatically about a week later (by the daily clean-up)",
  },
  {
    what: "Failed sign-ins: a one-way hash of the username and network address tried, and the time",
    why: "Slowing down password guessing",
    who: "Nobody",
    kept: "Used for 15 minutes, then deleted with the next failed attempt or by the daily clean-up, so within about a day",
  },
  {
    what: "Riot data: your Riot IDs and their PUUIDs, ranks, champion mastery and the list of your games with your figures in each",
    why: "Profiles, statistics and Match History",
    who: "Team members",
    kept: "While the profile exists; when an account is deleted, an administrator chooses to archive the profile with its history or erase both",
  },
  {
    what: "Match records: for each stored game, the record Riot publishes (all ten players' in-game names, PUUIDs, champions, items, runes and results) and its timeline, kept once per game",
    why: "Match details, Matchups, Played Together and Encounters",
    who: "Team members, for games in a profile's history",
    kept: "Not deleted automatically: a game stays stored after the profiles that played it are erased, but is no longer shown",
  },
  {
    what: "Other players' last-known rank: the rank the app last saw for a player met in a game, with its date",
    why: "Shown beside a match's players in Match History",
    who: "Team members",
    kept: "Not deleted automatically; nothing adds new ones (they come from features since removed)",
  },
  {
    what: "Clash scouts the team saves: the opposing team's name and its players' names, ranks, champions and mastery as read from Clash's scouting screenshots, and the Riot ID and PUUID of each opponent a member checked with Riot. The screenshots themselves are read in your browser and never uploaded",
    why: "Preparing for Clash matches",
    who: "Team members",
    kept: "Until the team's owner deletes the scout; archiving only hides it",
  },
  {
    what: "What you add: roles, champion pools, card designs and your profile picture",
    why: "Your profile and the team pages",
    who: "Team members; the public team page shows some of it (below)",
    kept: "Until you change it or the profile is erased",
  },
  {
    what: "Social links, only if you add them: a YouTube or Twitch channel address and a Discord username",
    why: "So teammates, or visitors if you choose, can find you there",
    who: "Whoever you choose for each one: only you, team members, or also the public team page",
    kept: "Until you clear them; removed when your account is deleted",
  },
  {
    what: "Solo Queue Blocks: your goals, notes and logged games",
    why: "Your own practice journal",
    who: "Only you",
    kept: "Until you delete them or the profile is erased",
  },
  {
    what: "Admin activity: which account or setting an administrator changed, and when, with names as they were then",
    why: "A record of administration",
    who: "Administrators",
    kept: "Not deleted automatically",
  },
  {
    what: "Background job records: when the app's data jobs ran and how they went; their last log lines can name team members' Riot IDs",
    why: "Seeing whether syncing with Riot and the housekeeping work",
    who: "Administrators",
    kept: "Not deleted automatically",
  },
];

/**
 * Privacy notice (audit decision 14): what is stored, why, who sees it and for how long. Public,
 * linked from sign-in and Settings. It describes this codebase; the team's owner runs the install
 * and answers questions about it.
 */
export default async function PrivacyPage() {
  return (
    <BrandFrame eyebrow={(b) => b.productName.toUpperCase()} width="max-w-2xl">
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Privacy</h1>
      <p className="mt-2 text-sm text-fg-muted">
        This is a private app for one team. Administrators create every account; there is no public sign-up. Below is what it stores about members, why, who can see it and how long it stays. Updated {UPDATED}.
      </p>

      <h2 className="mt-5 text-sm font-semibold text-fg">What is stored</h2>
      <ul className="mt-2 divide-y divide-border/70 rounded-md border border-border text-sm" data-testid="privacy-stored">
        {STORED.map((row) => (
          <li key={row.what} className="space-y-1 p-3">
            <p className="text-fg">{row.what}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-fg-muted">
              <dt className="text-fg-subtle">Why</dt>
              <dd>{row.why}</dd>
              <dt className="text-fg-subtle">Who sees it</dt>
              <dd>{row.who}</dd>
              <dt className="text-fg-subtle">Kept</dt>
              <dd>{row.kept}</dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-fg-subtle">&quot;Team members&quot; means accounts on the team. A personal-use account, not on the team, is seen only by its own player and the administrators.</p>

      <h2 className="mt-5 text-sm font-semibold text-fg">The public team page</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Anyone can open the team page without an account. It shows the lineup and substitutes: display names, profile pictures, card designs, roles and champion pools, and a social link only where its owner chose to show it there. It never shows usernames, Riot IDs, ranks or statistics.
      </p>

      <h2 className="mt-5 text-sm font-semibold text-fg">What is not collected</h2>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg-muted">
        <li>No email address or phone number is asked for or stored, and the app sends no email.</li>
        <li>No analytics, advertising or tracking. The app&apos;s cookies only keep you signed in, remember other accounts you signed in to on this browser, and keep layout choices such as the sidebar; the browser also remembers champions you picked recently and the resources you marked as favourites.</li>
        <li>Nothing is sold or shared beyond the services below.</li>
      </ul>

      <h2 className="mt-5 text-sm font-semibold text-fg">Where it is kept</h2>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg-muted">
        <li>The app runs on Vercel and its database on Supabase, in the regions chosen when the app was set up. Each keeps its own short-lived request logs under its own policy.</li>
        <li>Game data comes from Riot Games&apos; API. Champion and item pictures load from Riot&apos;s image servers, which see your browser&apos;s address as any website does.</li>
        <li>The first time you use Clash Scout, your browser downloads its text-recognition files from jsDelivr, a public file service, which sees your browser&apos;s address in the same way.</li>
        <li>On Resources, your browser loads each listed site&apos;s small icon from that site, which sees your browser&apos;s address in the same way (without the address of the page you are on). Favourites you mark there stay in this browser only.</li>
        <li>When backups are set up, an encrypted copy of the database is kept for 28 days as a private file in the project&apos;s GitHub account.</li>
      </ul>

      <h2 className="mt-5 text-sm font-semibold text-fg">Your choices</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Change your display name, username, password, picture and social links in Settings. To see, correct or delete anything else, ask your team&apos;s owner or an administrator: they run this app and can archive or erase your profile. Questions about this notice go to the owner.
      </p>

      <p className="mt-5 text-xs text-fg-subtle">
        <Link href="/login" className="text-accent underline-offset-2 hover:underline">
          Sign in
        </Link>
        {" · "}
        <Link href="/public" className="text-accent underline-offset-2 hover:underline">
          Team page
        </Link>
      </p>
    </BrandFrame>
  );
}
