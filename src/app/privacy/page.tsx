import Link from "next/link";
import type { Metadata } from "next";
import { BrandFrame } from "@/components/auth/brand-frame";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy" };

/** The date this notice last changed; update it with the text. */
const UPDATED = "19 October 2026";

/** What the app stores, from the database schema (docs/UNIIVERSE_TECHNICAL_HANDOVER.md): who sees it and how long it stays. */
const STORED: Array<{ what: string; why: string; who: string; kept: string }> = [
  {
    what: "Your account: username, display name, access level, last sign-in, and your password as a scrypt hash (never the password itself)",
    why: "Signing in and deciding what you may do",
    who: "Team members see your display name; owners see accounts",
    kept: "Until an owner deletes the account",
  },
  {
    what: "Sign-in sessions: a hash of the session token, your browser's name and version, and when the session started and was last used",
    why: "Keeping you signed in for 24 hours",
    who: "Nobody in the app",
    kept: "The records stay after they expire, until the account is deleted",
  },
  {
    what: "Failed sign-ins: a one-way hash of the username and network address tried, and the time",
    why: "Slowing down password guessing",
    who: "Nobody",
    kept: "15 minutes",
  },
  {
    what: "Riot data: your Riot IDs and their PUUIDs, ranks, champion mastery and match history, including the names, champions and results of the other players in those matches",
    why: "Profiles, statistics, Match History and drafts",
    who: "Team members",
    kept: "While the profile exists; when an account is deleted, an owner chooses to archive the profile with its history or erase both",
  },
  {
    what: "What you add: roles, champion pools, card designs and your profile picture",
    why: "Your profile and the team pages",
    who: "Team members; the public team page shows some of it (below)",
    kept: "Until you change it or the profile is erased",
  },
  {
    what: "Solo Queue Blocks: your goals, notes and logged games",
    why: "Your own practice journal",
    who: "Only you",
    kept: "Until you delete them or the profile is erased",
  },
  {
    what: "Admin activity: which account or setting an admin changed, and when, with names as they were then",
    why: "A record of administration",
    who: "Owners",
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
        This is a private app for one team. Admins create every account; there is no public sign-up. Below is what it stores about members, why, who can see it and how long it stays. Updated {UPDATED}.
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
      <p className="mt-2 text-xs text-fg-subtle">&quot;Team members&quot; means accounts on the team. A personal-use account, not on the team, is seen only by its own player and the owners.</p>

      <h2 className="mt-5 text-sm font-semibold text-fg">The public team page</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Anyone can open the team page without an account. It shows the lineup and substitutes: display names, profile pictures, card designs, roles and champion pools. It never shows usernames, Riot IDs, ranks or statistics.
      </p>

      <h2 className="mt-5 text-sm font-semibold text-fg">What is not collected</h2>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg-muted">
        <li>No email address or phone number is asked for or stored, and the app sends no email.</li>
        <li>No analytics, advertising or tracking. The app&apos;s cookies only keep you signed in, remember other accounts you signed in to on this browser, and keep layout choices such as the sidebar; the browser also remembers champions you picked recently.</li>
        <li>Nothing is sold or shared beyond the services below.</li>
      </ul>

      <h2 className="mt-5 text-sm font-semibold text-fg">Where it is kept</h2>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-fg-muted">
        <li>The app runs on Vercel and its database on Supabase, in the regions chosen when the app was set up. Each keeps its own short-lived request logs under its own policy.</li>
        <li>Game data comes from Riot Games&apos; API. Champion and item pictures load from Riot&apos;s image servers, which see your browser&apos;s address as any website does.</li>
        <li>When backups are set up, an encrypted copy of the database is kept for 28 days as a private file in the project&apos;s GitHub account.</li>
      </ul>

      <h2 className="mt-5 text-sm font-semibold text-fg">Your choices</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Change your display name, username, password and picture in Settings. To see, correct or delete anything else, ask your team&apos;s owner: they run this app and can archive or erase your profile. Questions about this notice go to them too.
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
