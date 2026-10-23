import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandFrame } from "@/components/auth/brand-frame";
import { BrandIcon } from "@/components/brand-icons";
import { CopyDiscordUsername } from "@/components/privacy/copy-contact";
import { DEFAULT_BRANDING } from "@/domain/branding";
import { BACKUP_RETENTION_DAYS, PRIVACY_DISCORD, PRIVACY_UPDATED } from "@/domain/privacy";
import { getAppDb } from "@/server/bootstrap";
import { getBranding } from "@/server/repositories/branding";
import { publicRiotDataAllowed } from "@/server/public/access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy" };

/** What the app stores, from the database schema (docs/UNIIVERSE_TECHNICAL_HANDOVER.md): who sees it and how long it stays. */
const STORED: Array<{ what: string; why: string; who: string; kept: string }> = [
  {
    what: "Your account: username, display name, access level, last sign-in, and your password as a scrypt hash (never the password itself)",
    why: "Signing in and deciding what you may do",
    who: "Team members see your display name; administrators see accounts",
    kept: "Until an administrator deletes the account or removes your personal information",
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
    kept: "While the profile exists. When an account is deleted, an administrator archives the profile with its history or deletes it too; permanent removal takes all of it (below)",
  },
  {
    what: "Match records: for each stored game, the record Riot publishes (all ten players' in-game names, PUUIDs, champions, items, runes and results) and its timeline, kept once per game",
    why: "Match details, Matchups, Played Together and Encounters",
    who: "Team members, for games in a profile's history",
    kept: "Not deleted automatically: a game stays stored after the profiles that played it are deleted, but is no longer shown. Permanent removal takes the person out of every stored game (below)",
  },
  {
    what: "Other players' last-known rank: the rank the app last saw for a player met in a game, with its date",
    why: "Shown beside a match's players in Match History",
    who: "Team members",
    kept: "Not deleted automatically; nothing adds new ones (they come from features since removed). Permanent removal deletes the person's own",
  },
  {
    what: "Clash scouts saved before Clash Scout was retired: the opposing team's name and its players' names, ranks, champions and mastery as read from Clash's scouting screenshots, and the Riot ID and PUUID of each opponent a member had checked with Riot. Never the screenshots, which were read on the member's device and never uploaded (see Clash Scout)",
    why: "None any more: Clash Scout was retired, and nothing reads them or adds to them",
    who: "Nobody in the app: no page shows them",
    kept: "Until a planned database clean-up deletes all of them, once a recent backup has been checked. Permanent removal already empties a removed person's entries in them",
  },
  {
    what: "What you add: roles, champion pools, card designs and your profile picture",
    why: "Your profile and the team pages",
    who: "Team members; the public team page shows some of it (below)",
    kept: "Until you change it, or the profile is deleted or your personal information removed",
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
    kept: "Until you delete them, or the profile is deleted or your personal information removed",
  },
  {
    what: "Admin activity: which account or setting an administrator changed, and when, with names as they were then",
    why: "A record of administration",
    who: "Administrators",
    kept: "Not deleted automatically. Permanent removal replaces the person's name in it with “Erased member”",
  },
  {
    what: "Background job records: when the app's data jobs ran and how they went, with their last log lines (older lines can name team members' Riot IDs; newer ones name an account by a short number instead)",
    why: "Seeing whether syncing with Riot and the housekeeping work",
    who: "Administrators",
    kept: "Not deleted automatically. Permanent removal takes the person's Riot IDs out of them",
  },
  {
    what: "Page speed counts: how fast a signed-in page loaded and responded in your browser, rounded to a range, counted with only the page's section (such as Players) and the screen size class (phone, tablet or desktop). Nothing identifies you, your account or what you opened",
    why: "Seeing whether the app is fast enough on members' own devices",
    who: "Administrators, as totals per day",
    kept: "35 days",
  },
  {
    what: "Removal records: for each permanent removal, a reference and one-way codes of the removed account, profile, Riot accounts and Riot IDs, made with the app's secret key. Never a name, Riot ID or PUUID",
    why: "Keeping the person out of games stored later, stopping their Riot accounts being linked again by mistake, and removing them again if a backup is ever restored",
    who: "Administrators see each record's reference and date",
    kept: "Not deleted automatically. If the person asks to come back, an administrator releases it",
  },
];

/** The sections, in order: the page's own index links to each. */
const SECTIONS = [
  { id: "contact", label: "Contact" },
  { id: "stored", label: "What is stored" },
  { id: "public-page", label: "Public team page" },
  { id: "clash-scout", label: "Clash Scout" },
  { id: "removal", label: "Permanent removal" },
  { id: "backups", label: "Backups" },
  { id: "services", label: "Where it is kept" },
  { id: "browser", label: "Cookies and your browser" },
  { id: "choices", label: "Your choices" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];
const labelOf = (id: SectionId) => SECTIONS.find((s) => s.id === id)!.label;

function Section({ id, title, children, className = "mt-7 scroll-mt-4" }: { id: SectionId; title?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={className}>
      <h2 id={`${id}-h`} className="text-base font-semibold text-fg">
        {title ?? labelOf(id)}
      </h2>
      {children}
    </section>
  );
}

const LIST = "mt-2 list-disc space-y-1.5 pl-5 text-sm text-fg-muted marker:text-fg-subtle";
const LINK = "inline-flex min-h-8 items-center text-accent underline-offset-2 hover:underline pointer-coarse:min-h-10";

async function productName(): Promise<string> {
  try {
    return (await getBranding(await getAppDb())).productName;
  } catch {
    // The notice must render even when the database is unreachable.
    return DEFAULT_BRANDING.productName;
  }
}

/**
 * The privacy notice: what is stored, why, who sees it and for how long, how to ask about it
 * (Discord only), permanent removal and backups. Public, so a former member can read it; linked
 * from sign-in, the public team page and Settings. The contact, removal and backup paragraphs are
 * the wording the team owner approved (22 October 2026): change them only with their approval.
 */
export default async function PrivacyPage() {
  const name = await productName();
  // Whether this deployment shows Riot figures on the public pages (a Production key's setting).
  const publicFigures = publicRiotDataAllowed();
  return (
    <BrandFrame eyebrow={(b) => b.productName.toUpperCase()} width="max-w-2xl">
      <h1 className="mt-1 text-xl font-bold tracking-wordmark">Privacy</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {name} is a private app for one League of Legends team. Administrators create every account; there is no public sign-up. This notice explains what it stores about members, why, who can see it, how long it stays, and how to reach us about it.
      </p>
      <p className="mt-1 text-xs text-fg-subtle">
        Updated <time dateTime="2026-10-23">{PRIVACY_UPDATED}</time>
      </p>

      <nav aria-label="On this page" className="mt-4" data-testid="privacy-index">
        <ul className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="inline-flex min-h-8 items-center rounded-full border border-border bg-bg/40 px-3 text-xs text-fg-muted transition-colors hover:border-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-10">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section id="contact" title="Contact us about your privacy" className="mt-6 scroll-mt-4 rounded-panel border border-accent/40 bg-accent/5 p-4">
        <div data-testid="privacy-contact">
          <p className="mt-1 text-sm text-fg-muted">You can request access to, correction of, or permanent removal of your personal information stored by {name}.</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-md border border-border bg-bg/60 px-3 py-2">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <BrandIcon kind="discord" />
              <span className="text-fg-muted">Privacy contact: Discord —</span>
              <span className="select-all font-semibold text-fg" data-testid="privacy-discord">
                @{PRIVACY_DISCORD}
              </span>
            </p>
            <CopyDiscordUsername username={PRIVACY_DISCORD} />
          </div>
          <p className="mt-3 text-sm text-fg-muted">
            You don&apos;t need an active {name} account or membership in our Discord server to make a request. If we&apos;re not already connected on Discord, send a friend request to {PRIVACY_DISCORD}. Once accepted, you can privately message the team owner.
          </p>
          <p className="mt-2 text-sm text-fg-muted">We may need to verify your identity before processing requests involving personal information. Never share passwords or authentication credentials. All privacy requests are handled privately.</p>
          <p className="mt-2 text-xs text-fg-subtle" data-testid="privacy-verification">
            A Discord username on its own does not show who someone is. To check that a request comes from the person it is about, we may ask you to write from the Discord account linked to your profile, to confirm details of your account, or to change your League of Legends profile icon to one we name for a few minutes. We never ask for a password, sign-in link or code. Requests are taken on Discord only, so someone without a usable Discord account cannot make one this way.
          </p>
        </div>
      </Section>

      <Section id="stored">
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
      </Section>

      <Section id="public-page" title="The public team page">
        <p className="mt-1 text-sm text-fg-muted" data-testid="privacy-public-page">
          Anyone can open the team page without an account. It shows the lineup and substitutes: display names, profile pictures, card designs, roles and champion pools, and a social link only where its owner chose to show it there.{" "}
          {publicFigures ? "On this site it also shows their ranks and this season's statistics, and the team's Leaderboards among them. It never shows usernames or Riot IDs." : "It never shows usernames, Riot IDs, ranks or statistics."}
        </p>
      </Section>

      <Section id="clash-scout">
        <p className="mt-1 text-sm text-fg-muted">Clash Scout, a team-only page that read the opposing team&apos;s Clash scouting screenshots, has been retired. It no longer reads screenshots, asks Riot about anyone or stores anything.</p>
        <ul className={LIST} data-testid="privacy-clash-scout">
          <li>The scouts the team saved before then are still in the database, where no page shows them. They will be deleted in a database clean-up once a recent backup has been checked.</li>
          <li>Until then, permanent removal still empties a removed person&apos;s entries in them.</li>
          <li>Screenshots were always read on the member&apos;s own device; none was ever uploaded or stored.</li>
          <li>Browser storage that earlier versions left behind (an unsaved scout, and the text-recognition files&apos; cache) is deleted the next time {name} opens in that browser.</li>
        </ul>
      </Section>

      <Section id="removal" title="Permanent removal of personal information">
        <div data-testid="privacy-removal">
          <p className="mt-1 text-sm text-fg-muted">
            Members may request permanent removal of their personal information by contacting a {name} administrator. This process removes their account, profile, linked Riot identities and associated personal information. Shared gameplay records may be preserved only where the information can be sufficiently de-identified. Records that cannot be safely retained without identifying the person will be deleted.
          </p>
          <p className="mt-2 text-sm text-fg-muted">Previously created encrypted backups may temporarily retain information after deletion. Backup retention, offline copies and restoration procedures are managed to prevent previously erased information from being inadvertently restored.</p>
          <h3 className="mt-4 text-sm font-semibold text-fg">What a removal covers</h3>
          <ul className={LIST}>
            <li>The account and its sign-in sessions; the profile with its roles, champion pools, card design, picture and social links; Solo Queue Blocks; and every linked Riot account with its Riot IDs, PUUIDs, ranks, champion mastery and statistics.</li>
            <li>Games: a stored game that no other member&apos;s history or team record uses is deleted. In any other, the person&apos;s place becomes &ldquo;Removed player&rdquo;: only the side they played on and the result stay, never their name, Riot ID, champion, items or figures, and their part of the game&apos;s timeline is deleted.</li>
            <li>Team records, Clash scouts and notes: their name is replaced (&ldquo;Former member&rdquo; in drafts and match records, &ldquo;[removed]&rdquo; in notes), and their entries in Clash scouts are emptied.</li>
            <li>Logs: their name becomes &ldquo;Erased member&rdquo; in the admin activity log, and their Riot IDs are taken out of the background job records.</li>
            <li>A removal record (see What is stored) keeps games stored later from including them and stops their Riot accounts being linked again by mistake. It holds no name or Riot ID.</li>
          </ul>
          <p className="mt-3 text-sm text-fg-muted">
            Removal cannot be undone. It is not the same as deactivating an account (sign-in stops and nothing is deleted), deleting an account (the profile is archived, or deleted with its own history, while shared records stay) or archiving a profile (it is hidden and its history kept).
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            Riot Games still publishes every game it hosts, so anyone who looks up a shared game elsewhere, on Riot&apos;s services or sites such as OP.GG, can still see everyone who played it; {name} itself no longer keeps or shows who the removed player was. Copies held by the services below, such as their short-lived logs, follow those services&apos; own retention, so they may not be deleted at once.
          </p>
        </div>
      </Section>

      <Section id="backups">
        <div data-testid="privacy-backups">
          <p className="mt-1 text-sm text-fg-muted">
            An encrypted database backup is scheduled weekly. Each successful backup is tested by restoring it into a temporary database and is retained for {BACKUP_RETENTION_DAYS} days as a private GitHub Actions artifact. Information removed from the live database may remain in existing encrypted backups until those backups expire.
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            GitHub deletes each backup automatically when its {BACKUP_RETENTION_DAYS} days are up. The team owner may also download a backup to keep offline, in case GitHub&apos;s copies are ever lost; such a copy stays encrypted, but GitHub&apos;s {BACKUP_RETENTION_DAYS} days do not apply to it. Restoring any backup follows a written procedure that applies every removal made since the backup was taken before the app is used again, so erased information is not brought back.
          </p>
        </div>
      </Section>

      <Section id="services">
        <ul className={LIST}>
          <li>The app runs on Vercel and its database on Supabase, in the regions chosen when the app was set up. Each keeps its own short-lived request logs under its own policy.</li>
          <li>Game data comes from Riot Games&apos; API. Champion and item pictures load from Riot&apos;s image servers, which see your browser&apos;s address as any website does.</li>
          <li>On Resources, your browser loads each listed site&apos;s small icon from that site, which sees your browser&apos;s address in the same way (without the address of the page you are on).</li>
          <li>The encrypted backups are kept by GitHub, in the project&apos;s private repository (see Backups).</li>
          <li>Privacy requests are made on Discord, which handles the messages under its own policy.</li>
          <li>Nothing is sold, and nothing is shared beyond these services.</li>
        </ul>
      </Section>

      <Section id="browser">
        <ul className={LIST}>
          <li>Cookies: one keeps you signed in; one holds a short fingerprint of the signed-in account, so an open tab notices when you sign in as someone else; and two remember layout choices (Player or Admin Mode, and the sidebar). There are no advertising, analytics or tracking cookies.</li>
          <li>Your browser&apos;s own storage keeps the champions you picked recently, the resources you marked as favourites and whether Card Studio shows its preview.</li>
          <li>The app keeps one offline page in your browser, shown when a page cannot load for lack of a connection.</li>
          <li>No email address or phone number is asked for or stored, and the app sends no email. There is no analytics, advertising or tracking: the only measurement is the anonymous page speed counts above.</li>
        </ul>
      </Section>

      <Section id="choices">
        <p className="mt-1 text-sm text-fg-muted">
          Change your display name, username, password, picture and social links in Settings. To see what is stored about you, to have something else corrected, or to have your personal information permanently removed,{" "}
          <a href="#contact" className="text-accent underline-offset-2 hover:underline">
            contact us on Discord
          </a>
          .
        </p>
      </Section>

      <p className="mt-7 flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
        <Link href="/login" className={LINK}>
          Sign in
        </Link>
        <span aria-hidden>·</span>
        <Link href="/public" className={LINK}>
          Team page
        </Link>
      </p>
    </BrandFrame>
  );
}
