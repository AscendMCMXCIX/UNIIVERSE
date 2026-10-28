"use client";

import Link from "next/link";
import { ArrowLeft, Camera, Paintbrush } from "lucide-react";
import type { CardLook } from "@/domain/card-style";
import type { CardArt } from "@/domain/player-card";
import type { Role } from "@/domain/roles";
import type { PickerChampion } from "@/components/champions/types";
import { CardPreview } from "@/components/players/card-preview";
import { CustomiseCardButton } from "@/components/players/customise-card-button";
import { AvatarEditor } from "@/components/settings/account-details";
import { SocialLinksEditor } from "@/components/settings/social-links-editor";
import type { SocialLinkView, SocialLinks } from "@/domain/social-links";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClass } from "@/components/ui/button";
import { SetupSteps } from "./setup-steps";
import { useBrandNames } from "@/components/brand-names";

export interface PersonaliseCard {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  look: CardLook;
  art: CardArt | null;
  role: Role | null;
  /** The champions the card can feature (their pools), in order. */
  poolIds: string[];
  /** The social links teammates see on the card (filtered on the server). */
  social?: SocialLinkView[];
}

/**
 * The optional last step of the first sign-in: a profile picture and the player card, with the
 * same editors as Settings and My Profile (the picture cropper and the Player Card Studio), and the
 * real card as the preview. Each editor saves on its own; the preview here then shows the saved
 * card. Skipping keeps the defaults; everything stays changeable later.
 * `preview`: Admin → Previews, where nothing may be saved, so the editors are described, not opened.
 */
export function PersonaliseStep({ card, champions, customised, social = null, preview = false, onPreviewBack, onPreviewDone }: { card: PersonaliseCard; champions: PickerChampion[]; customised: boolean; social?: SocialLinks | null; preview?: boolean; onPreviewBack?: () => void; onPreviewDone?: () => void }) {
  const data = { role: card.role, rank: null, status: card.role ? ("main" as const) : null, season: null, poolIds: card.poolIds, social: card.social };
  const { productName } = useBrandNames();
  return (
    <div data-testid="personalise-step">
      <h1 className="mt-1 text-xl font-bold tracking-wordmark">Make it yours</h1>
      <p className="mt-2 text-sm text-fg-muted">Optional: add a picture, style your card and add your social links. You can skip this and do it any time from My Profile or Settings.</p>
      <SetupSteps current="personalise" />
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-6">
        <aside className="lg:order-2" aria-label="Your card" data-testid="personalise-preview">
          <p className="mb-1.5 text-xs font-medium text-fg-muted">Your card</p>
          <CardPreview view="team" look={card.look} art={card.art} name={card.name} avatarUrl={card.avatarUrl} data={data} champions={champions} />
          <p className="mt-1.5 text-xs text-fg-subtle">As teammates see it on Team and Players. It updates when you save a change.</p>
        </aside>

        <div className="min-w-0 space-y-5">
          <section aria-labelledby="personalise-picture" className="space-y-2">
            <h2 id="personalise-picture" className="text-base font-semibold">
              Profile picture
            </h2>
            {preview ? (
              <div className="flex flex-wrap items-center gap-4">
                <Avatar name={card.name} src={null} size="xl" />
                <Button variant="outline" disabled>
                  <Camera className="h-4 w-4" /> Add a picture
                </Button>
                <p className="w-full text-xs text-fg-subtle">Preview: on the real page this opens the picture cropper (PNG, JPEG or WebP, cropped to a square). Nothing is saved here.</p>
              </div>
            ) : (
              <AvatarEditor name={card.name} src={card.avatarUrl} />
            )}
          </section>

          <section aria-labelledby="personalise-card" className="space-y-2">
            <h2 id="personalise-card" className="text-base font-semibold">
              Player card
            </h2>
            <p className="text-sm text-fg-muted">Artwork and skin, colours, background or banner, frame, tagline and effects, in the Player Card Studio. It previews every change before you save.</p>
            {preview ? (
              <>
                <Button variant="outline" disabled>
                  <Paintbrush className="h-4 w-4" /> Open the Card Studio
                </Button>
                <p className="text-xs text-fg-subtle">Preview: on the real page this opens the Player Card Studio for their own card. Nothing is saved here.</p>
              </>
            ) : (
              <CustomiseCardButton variant="outline" className="min-h-11 px-3 text-sm" playerId={card.playerId} name={card.name} avatarUrl={card.avatarUrl} art={card.art} accent="default" look={card.look} champions={champions} poolIds={card.poolIds} preview={data} />
            )}
          </section>

          <section aria-labelledby="personalise-social" className="space-y-2">
            <h2 id="personalise-social" className="sr-only">
              Social links
            </h2>
            <SocialLinksEditor initial={social} preview={preview} />
          </section>

          <div className="flex gap-2 border-t border-border pt-4">
            {preview ? (
              <Button type="button" variant="outline" size="lg" onClick={onPreviewBack} data-testid="personalise-back">
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back
              </Button>
            ) : (
              <Link href="/welcome?step=profile" className={buttonClass("outline", "lg")} data-testid="personalise-back">
                <ArrowLeft className="h-4 w-4" aria-hidden /> Back
              </Link>
            )}
            {preview ? (
              <Button type="button" variant="primary" size="lg" className="flex-1" onClick={onPreviewDone} data-testid="personalise-done">
                Skip for now
              </Button>
            ) : (
              <Link href="/" className={buttonClass("primary", "lg", "flex-1")} data-testid="personalise-done">
                {customised ? `Done: open ${productName}` : "Skip for now"}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
