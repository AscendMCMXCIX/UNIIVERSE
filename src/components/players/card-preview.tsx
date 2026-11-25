"use client";

import * as React from "react";
import type { CardLook } from "@/domain/card-style";
import type { CardArt } from "@/domain/player-card";
import type { PickerChampion } from "@/components/champions/types";
import { LineupPreview } from "@/components/team/team-roster";
import { previewSlot, type StudioPreviewData } from "./studio-preview";

export type { StudioPreviewData } from "./studio-preview";

/**
 * The first-time setup's live preview of the player's card: Team's own card (RosterCard, laid out by
 * LineupPreview as the lineup lays it out in a column this narrow), inert, with what the form holds so
 * far. Before a role is chosen its chip says "Role". Below desktop widths it shows the card's top (the
 * artwork and the identity, which the setup's choices change) and leaves out its body (figures and pool,
 * which fill in later), so the form's fields stay in view, as the setup's preview always has (the
 * page budgets, e2e/page-budgets.json: 317px for the whole card on a 393px phone took the setup's
 * name step to 1.52 screens and Personalise to 2.1). Card Studio previews every place a card appears
 * with the pages' own components too (studio-preview.tsx), so neither preview can drift from the card.
 */
export const CardPreview = React.memo(function CardPreview({ look, art, name, avatarUrl, data, champions }: { look: CardLook; art: CardArt | null; name: string; avatarUrl: string | null; data: StudioPreviewData | null; champions: PickerChampion[] }) {
  const slot = React.useMemo(() => previewSlot({ playerId: "preview", name, avatarUrl, art, look, data, champions, own: false }), [name, avatarUrl, art, look, data, champions]);
  return (
    <div className="pointer-events-none max-lg:[&_[data-card-body]]:hidden" inert data-testid="card-preview" data-view="team" data-frame={look.style.frame} data-zoom={look.style.art.zoom}>
      <LineupPreview slot={slot} champions={champions} roleUnknown={!data?.role} />
    </div>
  );
});
