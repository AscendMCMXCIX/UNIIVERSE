import { cn } from "@/lib/cn";
import { PAGE_WIDTH, type PageWidth } from "@/lib/nav";

/** Neutral placeholder block shown while a page or panel is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} aria-hidden />;
}

/**
 * Page-sized loading layout: title bar plus a few panels, used by route loading states. `width`: the
 * width pageWidthOf gives the address (a Team section's own, else the ordinary 80rem; narrower pages
 * such as Settings are not told apart).
 */
export function PageSkeleton({ panels = 3, title = true, width = "max" }: { panels?: number; title?: boolean; width?: PageWidth }) {
  return (
    <div className={cn("mx-auto space-y-5", PAGE_WIDTH[width])} role="status" aria-live="polite" aria-label="Loading" data-testid="page-skeleton">
      {title ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      ) : null}
      {Array.from({ length: panels }, (_, i) => (
        <div key={i} className="rounded-card border border-border bg-surface panel-depth">
          <div className="border-b border-border px-4 py-3">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="space-y-2 px-4 py-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
      <p className="text-center text-xs text-fg-subtle">Loading…</p>
    </div>
  );
}

/** A card's placeholder: a title line and a block, as tall as the card it stands for. */
function SkeletonCard({ className, testId }: { className?: string; testId?: string }) {
  return (
    <div className={cn("space-y-3 rounded-card border border-border bg-surface p-4 panel-depth", className)} data-testid={testId}>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-[calc(100%-1.75rem)] min-h-16 w-full" />
    </div>
  );
}

/**
 * Profile Overview's loading state in the page's own shape (player-overview.tsx, OverviewDashboard):
 * the heading, then the season's card beside recent form, ranked progress and the pools, with the
 * same container rules (two columns from a 58rem dashboard, the 2×2 from a 1440px window), so the
 * page does not jump from four full-width panels into a dashboard as it arrives.
 */
export function OverviewSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label="Loading" data-testid="overview-skeleton">
      {/* The heading as tall as the real one, so nothing jumps as it arrives: the title (28px), the
          scope line (two lines on a phone), and below xl the toolbar's row (Filters and Refresh, 44px
          to a finger). */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-4 w-48 max-w-full sm:hidden" />
        <Skeleton className="h-9 w-full max-w-md pointer-coarse:h-11 xl:hidden" />
      </div>
      <div className="@container/ov">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 @min-[58rem]/ov:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)] min-[90rem]:@min-[68rem]/ov:grid-cols-[minmax(0,1fr)_clamp(20rem,40%,30rem)]">
          <SkeletonCard className="h-80 @min-[34rem]/ov:h-72" />
          <SkeletonCard className="h-64 @min-[58rem]/ov:h-auto" />
          <SkeletonCard className="h-72 @min-[58rem]/ov:col-span-2 min-[90rem]:@min-[68rem]/ov:col-span-1 min-[90rem]:@min-[68rem]/ov:col-start-2 min-[90rem]:@min-[68rem]/ov:row-start-2" />
          <SkeletonCard className="h-96 @min-[58rem]/ov:col-span-2 min-[90rem]:@min-[68rem]/ov:col-span-1 min-[90rem]:@min-[68rem]/ov:col-start-1 min-[90rem]:@min-[68rem]/ov:row-start-2" />
        </div>
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}

/*
  Skeletons in their page's shape (UD.X4, P3): rows, a table, cards and a lineup, each with the same
  container rules and heights as the page it stands for (measured at 1440 × 900 on 19 Nov 2026), so
  nothing jumps sideways or changes columns when the content arrives. Hidden from screen readers
  but for the status and its "Loading…".
*/

/** A section's heading: the title, then its scope line, at the heights PageHeader and SectionHeader draw them. */
function HeadingSkeleton({ title = "w-40", tall = false }: { title?: string; tall?: boolean }) {
  return (
    <div className="space-y-2">
      <Skeleton className={cn(tall ? "h-8" : "h-7", title)} />
      <Skeleton className="h-4 w-[min(20rem,100%)]" />
    </div>
  );
}

/** A row's placeholder: a picture, then its name and a quieter line. */
function RowSkeleton({ className, picture = "h-10 w-10 rounded-full" }: { className?: string; picture?: string }) {
  return (
    <div className={cn("flex items-center gap-3 px-3", className)}>
      <Skeleton className={cn("shrink-0", picture)} />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-36 max-w-full" />
        <Skeleton className="h-3 w-52 max-w-full" />
      </div>
    </div>
  );
}

/**
 * Players (players-directory.tsx): the title and its count, the toolbar, then one panel of 64px rows,
 * one, two or three across by the roster's own width (two from 38rem, three from 84rem), at the
 * page's width (80rem, Team's 100rem from a 1600px window).
 */
export function PlayersSkeleton() {
  return (
    <div className={cn("space-y-4", PAGE_WIDTH.wideFrom1600)} role="status" aria-live="polite" aria-label="Loading" data-testid="players-skeleton">
      <div className="space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-5 w-28" />
        </div>
        <Skeleton className="h-11 w-full md:pointer-fine:h-9" />
      </div>
      <div className="@container/roster overflow-clip rounded-card border border-border bg-surface panel-depth" aria-hidden>
        <div className="-mb-px -mr-px grid grid-cols-1 @min-[38rem]/roster:grid-cols-2 @min-[84rem]/roster:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <RowSkeleton key={i} className="h-16 border-b border-r border-border/60" />
          ))}
        </div>
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}

/**
 * All Champions (all-champions.tsx), under the profile's header and tabs: its heading, then the
 * table's panel: the search row, the column headings and the champions' rows.
 */
export function ChampionsSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label="Loading" data-testid="champions-skeleton">
      <HeadingSkeleton />
      <div className="rounded-card border border-border bg-surface panel-depth" aria-hidden>
        <div className="flex items-center gap-3 border-b border-border px-3 py-2.5">
          <Skeleton className="h-11 w-full max-w-xs md:pointer-fine:h-9" />
        </div>
        <div className="flex h-9.5 items-center border-b border-border px-3">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="divide-y divide-border/60">
          {Array.from({ length: 6 }, (_, i) => (
            <RowSkeleton key={i} className="h-14" picture="h-9 w-9 rounded-md" />
          ))}
        </div>
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}

/**
 * Match History (match-history-view.tsx), under the profile's header and tabs: the views and the
 * scope line, the season's summary strip, then game cards (about 100px each on a wide card).
 */
export function HistorySkeleton() {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-label="Loading" data-testid="history-skeleton">
      <div className="space-y-1">
        <Skeleton className="h-11 w-56 md:pointer-fine:h-9" />
        <Skeleton className="h-4 w-[min(20rem,100%)]" />
      </div>
      <Skeleton className="h-11 w-full rounded-panel" />
      <div className="space-y-1.5" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-36 rounded-panel border border-border bg-surface sm:h-26" />
        ))}
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}

/**
 * Team Overview (team-roster.tsx): the team's header (logo, name and the lineup's state) above the
 * five cards, with the lineup's widths and its columns (one card on a phone, 3 + 2 from a 36rem
 * lineup, five across from 56rem: S3a), centred in the height under the tabs as the lineup is
 * (data-fills-height). On a phone the header is its one line (S2b: the top bar carries the logo and
 * the name).
 */
export function LineupSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[var(--content-wide)] flex-col lg:flex-1" role="status" aria-live="polite" aria-label="Loading" data-testid="lineup-skeleton">
      <div className="@container/lineup flex flex-col gap-5 lg:flex-1 lg:justify-center lg:gap-6" data-fills-height>
        <div className="mx-auto flex w-full max-w-[26rem] items-center gap-3 @xl:max-w-[54rem] @4xl:max-w-[80rem] @5xl:max-w-[84rem] min-[120rem]:@5xl:max-w-full sm:gap-4" aria-hidden>
          <Skeleton className="h-12 w-12 shrink-0 rounded-panel max-sm:hidden max-lg:short:hidden sm:h-16 sm:w-16 lg:h-20 lg:w-20" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-48 max-w-full max-sm:hidden max-lg:short:hidden lg:h-9" />
            <Skeleton className="h-4 w-36 max-w-full" />
          </div>
        </div>
        <div className="mx-auto grid w-full max-w-[26rem] grid-cols-1 gap-3 @xl:max-w-[54rem] @xl:grid-cols-6 @4xl:max-w-[84rem] @4xl:grid-cols-5 @7xl:gap-5 min-[120rem]:@5xl:max-w-full" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={cn("h-116 rounded-card border border-border bg-surface panel-depth @xl:col-span-2 @4xl:col-span-1", i > 0 && "hidden @xl:block", i === 3 && "@xl:col-start-2 @4xl:col-start-auto")} />
          ))}
        </div>
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}

/**
 * Riot Accounts (profile-accounts-tab.tsx, RiotAccountsPanel), under the profile's header and tabs:
 * the panel with its title and one-line lead, then the account cards (two columns from md, as the
 * list is) and the Add button's row, each as tall as it is drawn (a card about 96px; the button 44px
 * on touch, 36px with a mouse), so the page lands in the skeleton's place. The title is the panel's
 * own fixed word. Data diagnostics (administrators only) is left out: most viewers never have it.
 */
export function AccountsSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-live="polite" aria-label="Loading" data-testid="accounts-skeleton">
      <section className="panel-depth min-w-0 rounded-panel border border-border bg-surface" aria-hidden>
        <div className="space-y-0.5 border-b border-border px-3 py-3 sm:px-4">
          <p className="text-base font-semibold text-fg">Riot accounts</p>
          <Skeleton className="h-5 w-[min(24rem,100%)]" />
          {/* On a phone the lead takes two lines. */}
          <Skeleton className="h-5 w-24 sm:hidden" />
        </div>
        <div className="space-y-3 px-3 py-3 sm:px-4">
          <div className="grid gap-2.5 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-panel border border-border bg-bg-elevated p-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-44" />
            </div>
          </div>
          <Skeleton className="h-11 w-44 pointer-fine:h-9" />
        </div>
      </section>
      <p className="sr-only">Loading…</p>
    </div>
  );
}

/**
 * A profile opened from outside it (players/[id]: the boundary above the profile's layout): the
 * header as tall as it is drawn (the band from sm; the full card on a phone held upright), the
 * section tabs, then the section's own skeleton.
 */
export function ProfileSkeleton({ section }: { section: "overview" | "champions" | "matches" | "accounts" }) {
  return (
    <div className="max-w-[var(--content-max)] space-y-4" role="status" aria-live="polite" aria-label="Loading" data-testid="profile-skeleton">
      {/* On a phone held upright the band of Champions, History and Accounts is in the top bar (S2b), and the section tabs are always there. */}
      <div className={cn("h-36 rounded-card border border-border bg-surface band:h-18", section !== "overview" && "max-md:not-short:hidden")} aria-hidden />
      <Skeleton className="h-11 w-full max-w-lg max-md:hidden max-lg:short:hidden" />
      {section === "overview" ? <OverviewSkeleton /> : section === "champions" ? <ChampionsSkeleton /> : section === "matches" ? <HistorySkeleton /> : <AccountsSkeleton />}
    </div>
  );
}
