"use client";

import * as React from "react";
import { accentCss, type CardLook } from "@/domain/card-style";
import type { CardArt } from "@/domain/player-card";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { PortraitChampion } from "@/components/champion-portrait";
import { cn } from "@/lib/cn";
import { CardArtLayer } from "./card-art";
import { CardFrame, cardShellStyle } from "./card-look";
import { CardIdentity, CardPerformance, CardPool, CardRoleChip, type CardSeason } from "./player-card";
import type { CompactRank } from "./rank-emblem";
import { RosterRow } from "./roster-row";
import { CardSocialIcons } from "./social-links";
import type { SocialLinkView } from "@/domain/social-links";

/** What the player's card really shows, so a preview shows their card rather than a template. */
export interface StudioPreviewData {
  role: Role | null;
  rank: CompactRank | null;
  /** False: the editor may not see this player's rank (a player manager without "view teammates' statistics"), so the preview leaves it out, never "Unranked". */
  showRank?: boolean;
  status: "main" | "off" | null;
  season: CardSeason | null;
  /** The role's pool, in order (the first few appear on the card). */
  poolIds: string[];
  /** The social links teammates see on the card, as icons (none when left out). */
  social?: readonly SocialLinkView[];
}

/** Which card a preview shows: the Team card, a phone's card, or the player's Players row. */
export type PreviewView = "team" | "phone" | "directory";

/**
 * A player's card as Team ("team") or a phone ("phone") shows it, built from the same card parts,
 * or their row on Players ("directory"). The Player Card Studio and the first-time setup both
 * preview with it, so a preview never drifts from the real card. Below desktop widths the Team
 * view shows the card's top only (to keep the controls in view); `full` shows all of it anywhere.
 */
export const CardPreview = React.memo(function CardPreview({ view, look, art, name, avatarUrl, data, champions, full = false }: { view: PreviewView; look: CardLook; art: CardArt | null; name: string; avatarUrl: string | null; data: StudioPreviewData | null; champions: PortraitChampion[]; full?: boolean }) {
  const accent = accentCss(look.style);
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const pool = (data?.poolIds ?? []).map((id) => byId.get(id) ?? { id, name: id, portraitUrl: "" });
  const roleLabel = data?.role ? ROLE_LABELS[data.role] : "Role";
  if (view === "directory") {
    // The player's row on Players (RosterRow), as tablets and desktops show it (a faint strip of the
    // chosen art behind the picture and name, the links as icons) and as a phone shows it (no art, the
    // links left to the profile). The role here may be the lineup's and the pool every champion the
    // player can feature, so the pool is named neither as the Primary Role's.
    const row = (screen: "wide" | "phone") => <RosterRow screen={screen} look={look} art={art} name={name} avatarUrl={avatarUrl} role={data?.role ?? null} offRoles={[]} rank={data?.rank ?? null} showRank={data?.showRank ?? true} riot={null} pool={pool} poolLabel="Champion pool" social={data?.social} />;
    // In a panel as on Players: the row's own hairlines run past its edges, which clip them.
    const panel = (screen: "wide" | "phone", label: string, testId: string) => (
      <div className="overflow-clip rounded-card border border-border bg-surface panel-depth" data-testid={testId}>
        <ul className="-mb-px -mr-px" aria-label={label}>
          {row(screen)}
        </ul>
      </div>
    );
    return (
      <div className="mx-auto w-full max-w-[24rem] space-y-3" data-testid="card-preview" data-view="directory">
        <div>
          {panel("wide", "Your row on Players, on tablets and desktops", "card-preview-row-wide")}
          <p className="mt-1 text-center text-xs text-fg-subtle">Players, on tablets and desktops</p>
        </div>
        <div className="mx-auto max-w-[20rem]">
          {panel("phone", "Your row on Players, on a phone", "card-preview-row")}
          <p className="mt-1 text-center text-xs text-fg-subtle">On a phone, and in Leaderboards: the name, emblem, colours and tagline follow; the art does not.</p>
        </div>
      </div>
    );
  }
  const phone = view === "phone";
  return (
    <div className={cn("mx-auto w-full", phone ? "max-w-[20rem]" : "max-w-[24rem]")} data-testid="card-preview" data-view={view} data-frame={look.style.frame} data-zoom={look.style.art.zoom}>
      <article className="@container/card relative flex flex-col overflow-hidden rounded-card border border-border" style={cardShellStyle(look)}>
        <CardFrame look={look} />
        {/* The Team card's artwork: as tall as the identity at its foot needs, never less than the card's own minimum. */}
        <div className="relative flex min-h-[10.5rem] shrink-0 flex-col justify-end px-3 pb-2.5 pt-12">
          <CardArtLayer art={art} accent={accent} kind="splash" position="center 22%" look={look} testId="preview-art" smooth={false} foot />
          <CardRoleChip role={data?.role ?? null} label={roleLabel} className="absolute left-3 top-3" />
          <span className="relative">
            <CardIdentity look={look} name={name} avatarUrl={avatarUrl} rank={data?.rank ?? null} showRank={data?.showRank ?? true} status={data?.status ?? null} role={data?.role ?? null} social={data?.social?.length ? <CardSocialIcons links={data.social} owner={name} mode="static" /> : null} />
          </span>
        </div>
        <div className={cn("flex flex-col gap-2.5 px-3 pb-3 pt-2.5", !phone && !full && "max-lg:hidden")} style={{ backgroundImage: "linear-gradient(to bottom, color-mix(in srgb, var(--card-accent) 7%, transparent), transparent 70%)" }}>
          <CardPerformance season={data?.season ?? null} support={data?.role === "SUPPORT"} roleLabel={roleLabel} placeholder={!data?.season} />
          <CardPool champions={pool} roleLabel={roleLabel} showFigures={false} testId="preview-pool" />
        </div>
      </article>
    </div>
  );
});
