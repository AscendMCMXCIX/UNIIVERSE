import { ROLE_LABELS } from "@/domain/roles";
import type { ProfileHeaderData } from "@/server/players/profile-header";
import { ACCENT_COLOR, cardArt, featurableChampions, isCardAccent } from "@/domain/player-card";
import type { PickerChampion } from "@/components/champions/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RoleIcon } from "@/components/role-icon";
import { CardArtLayer } from "./card-art";
import { CustomiseCardButton } from "./customise-card";

/**
 * The profile header: the player's Team card, expanded. Same artwork (chosen champion and skin),
 * accent, picture, roles and rank; the Customise button appears for whoever may edit the card.
 */
export function ProfileHeader({ data, self, editable = false, champions = [] }: { data: ProfileHeaderData; self: boolean; editable?: boolean; champions?: PickerChampion[] }) {
  const p = data.player;
  const accentKey = isCardAccent(p.cardAccent) ? p.cardAccent : "default";
  const accent = ACCENT_COLOR[accentKey];
  const art = cardArt(p);
  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-surface" data-testid="profile-header">
      <CardArtLayer art={art} accent={accent} kind="splash" position="center 25%" strength="normal" testId="profile-art" />
      <div className="relative flex min-h-44 flex-col justify-end gap-4 p-4 sm:min-h-52 sm:flex-row sm:items-end sm:p-6">
        <div className="flex min-w-0 flex-1 items-end gap-4">
          <Avatar name={p.displayName} src={data.avatarUrl} size="hero" ring="accent" />
          <div className="min-w-0 pb-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-fg drop-shadow sm:text-3xl">{p.displayName}</h1>
              {self ? <Badge tone="accent">You</Badge> : null}
              {p.archivedAt ? <Badge tone="warn">Archived</Badge> : null}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
              <span className="inline-flex items-center gap-1.5 text-fg">
                <span style={{ color: accent }} className="inline-flex">
                  <RoleIcon role={p.primaryRole} className="h-4 w-4" />
                </span>
                {ROLE_LABELS[p.primaryRole]}
              </span>
              {p.secondaryRole ? (
                <span className="inline-flex items-center gap-1.5">
                  <RoleIcon role={p.secondaryRole} className="h-4 w-4" /> {ROLE_LABELS[p.secondaryRole]} <span className="text-fg-subtle">(secondary)</span>
                </span>
              ) : null}
              {p.additionalRoles.map((a) => (
                <span key={a.role} className="inline-flex items-center gap-1.5" data-testid="additional-role">
                  <RoleIcon role={a.role} className="h-4 w-4 text-fg-subtle" /> {ROLE_LABELS[a.role]} <span className="text-fg-subtle">(also)</span>
                </span>
              ))}
              <span className="text-fg">{data.rank ? data.rank.text.split(" · ").slice(0, 2).join(" · ") : "Unranked"}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {data.lineupRole ? (
            <div className="flex items-center gap-2 rounded-xl border border-border-strong bg-bg/60 px-3 py-1.5 text-sm backdrop-blur-sm">
              <RoleIcon role={data.lineupRole} className="h-5 w-5 text-accent" />
              <span>
                <span className="block text-xs text-fg-muted">Main lineup</span>
                <span className="font-medium">{ROLE_LABELS[data.lineupRole]}</span>
              </span>
            </div>
          ) : null}
          {editable ? <CustomiseCardButton variant="outline" playerId={p.id} name={p.displayName} avatarUrl={data.avatarUrl} art={art} accent={accentKey} champions={champions} poolIds={featurableChampions(p)} /> : null}
        </div>
      </div>
    </header>
  );
}
