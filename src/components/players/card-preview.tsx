"use client";

import * as React from "react";
import { accentCss, type CardLook } from "@/domain/card-style";
import type { CardArt } from "@/domain/player-card";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { PortraitChampion } from "@/components/champion-portrait";
import { cn } from "@/lib/cn";
import { CardArtLayer } from "./card-art";
import { CardFrame, cardShellStyle } from "./card-look";
import { CardIdentity, CardPerformance, CardPool, CardRoleChip, PoolPreview, type CardSeason } from "./player-card";
import type { CompactRank } from "./rank-emblem";
import { CardSocialIcons } from "./social-links";
import type { SocialLinkView } from "@/domain/social-links";

/** What the player's card really shows, so a preview shows their card rather than a template. */
export interface StudioPreviewData {
  role: Role | null;
  rank: CompactRank | null;
  status: "main" | "off" | null;
  season: CardSeason | null;
  /** The role's pool, in order (the first few appear on the card). */
  poolIds: string[];
  /** The social links teammates see on the card, as icons (none when left out). */
  social?: readonly SocialLinkView[];
}

/** Which card a preview shows: the Team card, a phone's card, or the Players directory's. */
export type PreviewView = "team" | "phone" | "directory";

/**
 * A player's card as Team ("team"), a phone ("phone") or the Players directory ("directory")
 * shows it, built from the same card parts. The Player Card Studio and the first-time setup both
 * preview with it, so a preview never drifts from the real card. Below desktop widths the Team
 * view shows the card's top only (to keep the controls in view); `full` shows all of it anywhere.
 */
export const CardPreview = React.memo(function CardPreview({ view, look, art, name, avatarUrl, data, champions, full = false }: { view: PreviewView; look: CardLook; art: CardArt | null; name: string; avatarUrl: string | null; data: StudioPreviewData | null; champions: PortraitChampion[]; full?: boolean }) {
  const accent = accentCss(look.style);
  const byId = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const pool = (data?.poolIds ?? []).map((id) => byId.get(id) ?? { id, name: id, portraitUrl: "" });
  const roleLabel = data?.role ? ROLE_LABELS[data.role] : "Role";
  if (view === "directory") {
    return (
      <div className="mx-auto w-full max-w-[20rem]" data-testid="card-preview" data-view="directory">
        <div className="@container/card relative flex flex-col overflow-hidden rounded-card border" style={cardShellStyle(look, { glow: false })}>
          <CardFrame look={look} />
          <div className="relative flex min-h-28 flex-col justify-end px-3 pb-2.5 pt-12">
            <CardArtLayer art={art} accent={accent} kind="loading" position="center 16%" look={look} decorate={false} testId="preview-art" smooth={false} foot />
            <CardRoleChip role={data?.role ?? null} label={roleLabel} className="absolute left-3 top-3 px-2.5 py-0.5 text-xs" />
            <span className="relative">
              <CardIdentity look={look} name={name} avatarUrl={avatarUrl} rank={data?.rank ?? null} social={data?.social?.length ? <CardSocialIcons links={data.social} owner={name} mode="static" /> : null} />
            </span>
          </div>
          <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-3">
            <PoolPreview champions={pool} total={pool.length} label="Champion pool" max={6} testId="preview-pool" />
          </div>
        </div>
      </div>
    );
  }
  const phone = view === "phone";
  return (
    <div className={cn("mx-auto w-full", phone ? "max-w-[20rem]" : "max-w-[24rem]")} data-testid="card-preview" data-view={view} data-frame={look.style.frame} data-zoom={look.style.art.zoom}>
      <article className="@container/card relative flex flex-col overflow-hidden rounded-card border" style={cardShellStyle(look)}>
        <CardFrame look={look} />
        {/* The Team card's artwork: as tall as the identity at its foot needs, never less than the card's own minimum. */}
        <div className="relative flex min-h-[10.5rem] shrink-0 flex-col justify-end px-3 pb-2.5 pt-12">
          <CardArtLayer art={art} accent={accent} kind="splash" position="center 22%" look={look} testId="preview-art" smooth={false} foot />
          <CardRoleChip role={data?.role ?? null} label={roleLabel} className="absolute left-3 top-3" />
          <span className="relative">
            <CardIdentity look={look} name={name} avatarUrl={avatarUrl} rank={data?.rank ?? null} status={data?.status ?? null} role={data?.role ?? null} social={data?.social?.length ? <CardSocialIcons links={data.social} owner={name} mode="static" /> : null} />
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
