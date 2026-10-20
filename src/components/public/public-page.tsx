import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Gamepad2, HeartHandshake, MessagesSquare, Palette } from "lucide-react";
import { getAppDb } from "@/server/bootstrap";
import { getBranding } from "@/server/repositories/branding";
import { getPublicSite } from "@/server/repositories/public-site";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listChampions } from "@/server/repositories/champions";
import { loadPublicTeam, type PublicTeam } from "@/server/public/team";
import { defaultPlatform } from "@/server/auth/signup";
import { platformLabel } from "@/domain/platforms";
import { appBackgroundSrc, appBackgroundStillSrc, backgroundSrc, backgroundStillSrc, brandThemeCss, logoSrc, logoStillSrc, type Branding } from "@/domain/branding";
import { heroTitleFor, playingTextFor, type PublicSite } from "@/domain/public-site";
import { BrandImage } from "@/components/brand-image";
import { BrandMark } from "@/components/brand-mark";
import { BrandIcon } from "@/components/brand-icons";
import { BrandNamesProvider } from "@/components/brand-names";
import { InstallAppEntry, InstallAppProvider } from "@/components/install/install-app";
import { TeamRoster } from "@/components/team/team-roster";
import { riotLegal } from "@/components/app-shell";
import { SignInLink, SignInProvider } from "./sign-in";
import { PauseWhenHidden } from "./pause-when-hidden";
import { cn } from "@/lib/cn";

/*
  THE PUBLIC PAGE: the community's home for visitors, and the way in for members. One page, in the
  team's own branding (names, logo, colours, sign-in background) and in the words an admin chose
  (Admin → Branding → Public page):
    hero          who we are, with the way to the lineup and the community's Discord;
    Meet the Team the lineup and its substitutes, the same cards as the team's own page, built from
                  the public allowlist only (server/public/team.ts): no rank, figure or Riot ID;
    Our Community the Discord invitation an admin pasted (none: no button, never a made-up link);
    Playing With Us whether the team welcomes new players now, and that the Discord is the way in;
    footer        privacy, Riot's notice and the community's sign-off.
  Sign In opens a small window over the page (sign-in.tsx); members see Open App instead. Nothing
  here starts a refresh or calls Riot, and no request is made only to animate: the motion is CSS
  (globals.css, "The public page").
*/

const SIDE = "px-safe-5 sm:px-safe-8";

/** The tab title and link preview (Discord, messages) of the public page. */
export async function publicMetadata(): Promise<Metadata> {
  try {
    const db = await getAppDb();
    const [branding, site] = await Promise.all([getBranding(db), getPublicSite(db)]);
    const icon = logoStillSrc(branding);
    const description = site.heroText || undefined;
    return {
      title: { absolute: branding.teamName === branding.productName ? branding.teamName : `${branding.teamName} · ${branding.productName}` },
      description,
      openGraph: { title: heroTitleFor(site, branding.teamName), description, siteName: branding.productName, type: "website" },
      ...(icon ? { icons: { icon, apple: icon } } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * The whole public page. `member`: a signed-in member is looking (Open App instead of Sign In).
 * `preview`: Admin → Previews, where the sign-in form sends nothing.
 */
export async function PublicPage({ member, preview = false }: { member: boolean; preview?: boolean }) {
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const [branding, site, view, champions] = await Promise.all([getBranding(db), getPublicSite(db), loadPublicTeam(db, team.id), listChampions(db)]);
  const themeCss = brandThemeCss(branding);
  const logo = logoSrc(branding);
  const logoStill = logoStillSrc(branding);
  // The hero's image: the sign-in background (this page is the way in), else the app's own.
  const art = backgroundSrc(branding) ? { src: backgroundSrc(branding)!, still: backgroundStillSrc(branding) } : appBackgroundSrc(branding) ? { src: appBackgroundSrc(branding)!, still: appBackgroundStillSrc(branding) } : null;
  const home = member ? "/public" : "/";
  return (
    <div className="public-page relative isolate flex min-h-dvh flex-col overflow-x-clip" data-testid="public-page">
      {/* Branding colours: validated hex values only. */}
      {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
      <BrandNamesProvider names={{ productName: branding.productName, teamName: branding.teamName }}>
        <InstallAppProvider>
          <SignInProvider brand={{ logo, logoStill, shortName: branding.shortName }} preview={preview}>
            <a href="#main" className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-bg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
              Skip to content
            </a>
            <Header branding={branding} logo={logo} logoStill={logoStill} member={member} home={home} preview={preview} />
            <main id="main" className="flex-1">
              <Hero branding={branding} site={site} art={art} logo={logo} logoStill={logoStill} />
              <TeamSection view={view} champions={champions} />
              <Divider />
              <CommunitySection branding={branding} site={site} />
              <Divider />
              <PlayingSection site={site} />
            </main>
            <Footer branding={branding} site={site} logo={logo} logoStill={logoStill} member={member} home={home} />
          </SignInProvider>
        </InstallAppProvider>
      </BrandNamesProvider>
      <PauseWhenHidden targetId="hero" />
    </div>
  );
}

const enter = (i: number) => ({ "--i": i }) as CSSProperties;

const CTA = "group inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-6 text-[0.9375rem] font-semibold transition-[transform,background-color,border-color,box-shadow,color] duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:hover:translate-y-0 sm:w-auto";
const CTA_PRIMARY = cn(CTA, "bg-accent text-bg shadow-[0_12px_32px_-14px_var(--color-accent)] hover:bg-accent-strong hover:shadow-[0_16px_40px_-14px_var(--color-accent)]");
const CTA_SECONDARY = cn(CTA, "border border-white/15 bg-white/[0.04] text-fg hover:border-white/25 hover:bg-white/[0.08]");
const NAV_LINK = "inline-flex min-h-10 items-center rounded-md px-3 text-sm text-fg-muted transition-colors duration-200 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent";

function Header({ branding, logo, logoStill, member, home, preview }: { branding: Branding; logo: string | null; logoStill: string | null; member: boolean; home: string; preview: boolean }) {
  return (
    <header className={cn("sticky z-40", preview ? "top-11" : "top-0")} data-testid="public-header">
      {/* The header's surface fades in as the page scrolls, so the hero runs up under it at the top.
          Without a blur (touch screens) it is opaque: bright buttons scrolling under it would show through. */}
      <div aria-hidden className="public-header-surface absolute inset-0 border-b border-white/[0.07] bg-bg md:pointer-fine:bg-bg/70 md:pointer-fine:backdrop-blur-xl" />
      <div className={cn("relative mx-auto flex h-16 max-w-[80rem] items-center gap-1.5 sm:gap-2", SIDE)}>
        <Link href={home} className="mr-auto flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-2 focus-visible:outline-2 focus-visible:outline-accent" data-testid="public-home-link">
          <BrandMark src={logo} still={logoStill} name={branding.shortName} className="h-8 w-8 rounded-lg text-sm" />
          <span className="truncate text-[0.8125rem] font-semibold tracking-[0.2em] text-fg">{branding.shortName}</span>
        </Link>
        <nav aria-label="On this page" className="mr-1 hidden items-center md:flex">
          <a href="#team" className={NAV_LINK}>
            Team
          </a>
          <a href="#community" className={NAV_LINK}>
            Community
          </a>
          <a href="#playing" className={cn(NAV_LINK, "max-lg:hidden")}>
            Playing With Us
          </a>
        </nav>
        <InstallAppEntry variant="public" />
        {member ? (
          <Link href="/" className="group inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-semibold text-bg transition-colors duration-200 hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:h-11" data-testid="public-open-app">
            Open App <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ) : (
          <SignInLink className="inline-flex h-10 items-center rounded-lg border border-white/15 bg-white/[0.04] px-4 text-sm font-semibold text-fg transition-colors duration-200 hover:border-white/25 hover:bg-white/[0.09] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:h-11" testId="public-sign-in">
            Sign In
          </SignInLink>
        )}
      </div>
    </header>
  );
}

function Hero({ branding, site, art, logo, logoStill }: { branding: Branding; site: PublicSite; art: { src: string; still: string | null } | null; logo: string | null; logoStill: string | null }) {
  return (
    <section id="hero" aria-labelledby="hero-title" className="relative isolate -mt-16 flex min-h-[min(40rem,74svh)] items-center overflow-hidden pt-16 sm:min-h-[min(46rem,84svh)] short:min-h-0" data-testid="public-hero">
      {/* Atmosphere only, hidden from screen readers: the branding's image under a veil, two soft
          lights in the team's colours drifting very slowly, and a fade into the page. */}
      {/* The whole layer fades out towards the bottom (a mask, not a colour), so the page's own
          background continues under it without a seam. */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_bottom,black_45%,transparent)]">
        {art ? <BrandImage src={art.src} still={art.still} className="h-full w-full object-cover opacity-40" /> : null}
        <div className="public-aurora public-aurora-a left-[-25%] top-[-35%] h-[85vmax] w-[85vmax] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-accent)_22%,transparent),transparent)]" />
        <div className="public-aurora public-aurora-b right-[-30%] top-[5%] h-[75vmax] w-[75vmax] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--color-accent-2)_16%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_75%_at_50%_42%,transparent_0%,var(--color-bg)_100%)] opacity-90" />
      </div>
      <div className={cn("mx-auto flex w-full max-w-[62rem] flex-col items-center py-[clamp(3.5rem,10vh,7rem)] text-center short:py-6", SIDE)}>
        {/* A phone held sideways leaves room for the words and the buttons only: the logo is in the header. */}
        {logo ? <BrandImage src={logo} still={logoStill} className="public-enter h-16 w-16 rounded-2xl object-contain shadow-[0_24px_60px_-28px_var(--color-accent)] sm:h-20 sm:w-20 short:hidden" /> : null}
        <p className={cn("public-enter text-xs font-semibold uppercase tracking-[0.3em] text-accent short:mt-0", logo ? "mt-7" : "")} style={enter(1)}>
          {platformLabel(defaultPlatform())} <span className="mx-1.5 text-fg-subtle">·</span> League of Legends
        </p>
        <h1 id="hero-title" className="public-enter mt-4 text-balance text-[clamp(2.5rem,4.2vw+1.25rem,4.75rem)] font-semibold leading-[1.03] tracking-[-0.035em] text-fg short:text-[2.25rem]" style={enter(2)} data-testid="public-hero-title">
          {heroTitleFor(site, branding.teamName)}
        </h1>
        {site.heroText ? (
          <p className="public-enter mt-5 max-w-[36rem] text-pretty text-[clamp(1.0625rem,0.45vw+0.95rem,1.25rem)] leading-relaxed text-fg-muted short:mt-3 short:text-base" style={enter(3)}>
            {site.heroText}
          </p>
        ) : null}
        <div className="public-enter mt-9 flex w-full max-w-xs flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center short:mt-5" style={enter(4)}>
          <a href="#team" className={CTA_PRIMARY} data-testid="public-cta-team">
            {site.teamLabel}
            <ArrowDown className="h-4 w-4 transition-transform duration-200 group-hover:translate-y-0.5" aria-hidden />
          </a>
          {site.discordUrl ? (
            <a href={site.discordUrl} target="_blank" rel="noopener noreferrer" className={CTA_SECONDARY} data-testid="public-cta-community">
              <BrandIcon kind="discord" className="h-[18px] w-[18px]" />
              {site.communityLabel}
              <span className="sr-only"> (Discord, opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SectionIntro({ id, kicker, title, children, align = "center" }: { id: string; kicker: string; title: string; children?: ReactNode; align?: "center" | "start" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-[40rem] text-center" : "max-w-[36rem]"}>
      <p className="text-xs font-semibold uppercase tracking-[0.26em] text-accent">{kicker}</p>
      <h2 id={id} className="mt-3 text-balance text-[clamp(1.875rem,1.5vw+1.4rem,2.75rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-fg">
        {title}
      </h2>
      {children ? <p className="mt-4 text-pretty text-base leading-relaxed text-fg-muted sm:text-[1.0625rem]">{children}</p> : null}
    </div>
  );
}

function Divider() {
  return <div aria-hidden className="mx-auto h-px w-[min(72rem,calc(100%-2.5rem))] bg-gradient-to-r from-transparent via-white/10 to-transparent" />;
}

function TeamSection({ view, champions }: { view: PublicTeam; champions: Array<{ id: string; name: string; portraitUrl: string }> }) {
  return (
    <section id="team" aria-labelledby="team-title" className="scroll-mt-16 pb-[clamp(4rem,8vw,6.5rem)] pt-[clamp(2rem,5vw,3.5rem)]" data-testid="public-team">
      <div className="mx-auto max-w-[96rem] px-safe-4 sm:px-safe-6 lg:px-safe-8">
        <div className="public-rise">
          <SectionIntro id="team-title" kicker="The lineup" title="Meet the Team">
            One player in every role, and the substitutes who step in.
          </SectionIntro>
        </div>
        <div className="public-rise mt-10 sm:mt-12">
          <TeamRoster team={view.team} slots={view.slots} complete={view.complete} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }))} canManageLineup={false} canViewPlayers={false} editablePlayerIds={[]} viewerPlayerId={null} guest={{ profileBase: null }} header={false} />
        </div>
      </div>
    </section>
  );
}

const PILLARS = [
  { icon: MessagesSquare, label: "Conversation" },
  { icon: Gamepad2, label: "Games" },
  { icon: Palette, label: "Creativity" },
  { icon: HeartHandshake, label: "Connection" },
] as const;

function CommunitySection({ branding, site }: { branding: Branding; site: PublicSite }) {
  const discord = site.discordUrl;
  return (
    <section id="community" aria-labelledby="community-title" className="scroll-mt-16 py-[clamp(4rem,8vw,6.5rem)]" data-testid="public-community">
      <div className={cn("mx-auto grid max-w-[72rem] items-center gap-10 lg:gap-16", discord ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]" : "", SIDE)}>
        <div className={cn("public-rise", discord ? "" : "mx-auto text-center")}>
          <SectionIntro id="community-title" kicker="Discord" title="Our Community" align={discord ? "start" : "center"}>
            {site.communityText}
          </SectionIntro>
          <ul className={cn("mt-8 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4", discord ? "lg:grid-cols-2 xl:grid-cols-4" : "mx-auto max-w-[40rem]")} aria-label="What the community is about">
            {PILLARS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-sm text-fg">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03]">
                  <Icon className="h-4 w-4 text-accent" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
        {discord ? (
          <div className="public-rise relative overflow-hidden rounded-card border border-white/10 bg-surface/60 p-6 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.85)] sm:p-8" data-testid="public-discord-card">
            <div aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#5865F2]/70 to-transparent" />
            <div className="flex items-center gap-3.5">
              <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#5865F2]/[0.14] ring-1 ring-[#5865F2]/30">
                <BrandIcon kind="discord" className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-fg-subtle">Discord server</p>
                <p className="truncate text-lg font-semibold text-fg">{branding.teamName}</p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-fg-muted">Conversation, games and good company. Come and say hello.</p>
            <a href={discord} target="_blank" rel="noopener noreferrer" className={cn(CTA_PRIMARY, "mt-6 sm:w-full")} data-testid="public-discord-join">
              {site.communityLabel}
              <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
              <span className="sr-only"> (Discord, opens in a new tab)</span>
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PlayingSection({ site }: { site: PublicSite }) {
  const open = site.playingOpen;
  return (
    <section id="playing" aria-labelledby="playing-title" className="scroll-mt-16 py-[clamp(4rem,8vw,6.5rem)]" data-testid="public-playing">
      <div className={cn("public-rise mx-auto max-w-[44rem] text-center", SIDE)}>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-fg-muted" data-testid="playing-status" data-open={open}>
          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", open ? "bg-good shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-good)_22%,transparent)]" : "bg-fg-subtle")} />
          {open ? "Open to new players" : "Not looking for players right now"}
        </span>
        <h2 id="playing-title" className="mt-5 text-balance text-[clamp(1.875rem,1.5vw+1.4rem,2.75rem)] font-semibold leading-[1.1] tracking-[-0.025em] text-fg">
          Playing With Us
        </h2>
        <p className="mt-4 text-pretty text-base leading-relaxed text-fg-muted sm:text-[1.0625rem]">{playingTextFor(site)}</p>
        {open && site.discordUrl ? (
          <a href={site.discordUrl} target="_blank" rel="noopener noreferrer" className={cn(CTA_SECONDARY, "mt-8")} data-testid="public-playing-discord">
            <BrandIcon kind="discord" className="h-[18px] w-[18px]" />
            Say hello on Discord
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
        <p className="mt-6 text-xs text-fg-subtle">Joining the Discord makes you part of the community, not of the League team.</p>
      </div>
    </section>
  );
}

const FOOT_LINK = "touch-target rounded-sm text-fg-muted transition-colors duration-200 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function Footer({ branding, site, logo, logoStill, member, home }: { branding: Branding; site: PublicSite; logo: string | null; logoStill: string | null; member: boolean; home: string }) {
  return (
    <footer className="relative border-t border-white/[0.06]" data-testid="public-footer">
      <div className={cn("mx-auto max-w-[72rem] pb-[max(2rem,env(safe-area-inset-bottom))] pt-10", SIDE)}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href={home} className="flex items-center gap-2.5 self-start rounded-lg focus-visible:outline-2 focus-visible:outline-accent sm:self-auto">
            <BrandMark src={logo} still={logoStill} name={branding.shortName} className="h-8 w-8 rounded-lg text-sm" />
            <span className="text-[0.8125rem] font-semibold tracking-[0.2em] text-fg">{branding.shortName}</span>
          </Link>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <a href="#team" className={FOOT_LINK}>
              Team
            </a>
            {site.discordUrl ? (
              <a href={site.discordUrl} target="_blank" rel="noopener noreferrer" className={FOOT_LINK}>
                Discord<span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
            <Link href="/privacy" className={FOOT_LINK}>
              Privacy
            </Link>
            {member ? (
              <Link href="/" className={FOOT_LINK}>
                Open App
              </Link>
            ) : (
              <SignInLink className={FOOT_LINK}>Sign In</SignInLink>
            )}
          </nav>
        </div>
        {site.signOff ? (
          <p className="mt-10 flex items-center gap-4 text-[0.6875rem] font-medium uppercase tracking-[0.32em] text-fg-muted" data-testid="public-sign-off">
            <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-transparent to-white/15" />
            <span className="text-center">{site.signOff}</span>
            <span aria-hidden className="h-px flex-1 bg-gradient-to-l from-transparent to-white/15" />
          </p>
        ) : null}
        <p className="mt-8 text-[0.6875rem] leading-relaxed text-fg-subtle" data-testid="public-legal">
          {riotLegal(branding.productName)}
        </p>
      </div>
    </footer>
  );
}
