import { Sigma } from "lucide-react";
import type { ChampionIntelView, Slot } from "@/domain/matchup-intel/types";
import type { MatchupEvidence } from "@/domain/matchup-intel/evidence";
import { RemoteImage } from "@/components/ui/remote-image";
import { AbilityRefLink } from "./ability-ref-link";
import { firstEvidenceRow } from "./evidence-panel";
import { SLOT_NAMES, abilityAnchor, glanceCooldown } from "./wording";

/*
  MATCHUP INTEL's first screen on a phone (PLAN §S7a; docs/MATCHUP_INTEL.md, "On a phone"): under the
  pair, every enemy ability as a tile (about 68 by 56px) with its cooldown line, P to R in one row of five (in the
  bot lane the second enemy's under it, a second row), then the evidence's first row. Each tile is a
  link to its full tile in the enemy's panel below, which keeps every word (the cooldown at each rank,
  where it comes from, the facts and Details); the tile's own line is the base cooldown at the first and
  the last rank (or level), never a hasted value. Phones only (under sm): a wider screen shows the panels
  themselves on its first screen. The icons are lazy, so a hidden copy on a wider screen fetches nothing. Nothing here is read beyond what the panels below already show.
*/

const SLOTS: readonly Slot[] = ["P", "Q", "W", "E", "R"];

function GlanceIcon({ src, slot }: { src: string | null; slot: Slot }) {
  const standIn = (
    <span aria-hidden className="grid h-full w-full place-items-center rounded-md border border-border bg-surface-2 text-xs font-semibold text-fg-subtle">
      {slot}
    </span>
  );
  if (!src) return standIn;
  return <RemoteImage src={src} fallback={standIn} alt="" width={32} height={32} loading="lazy" decoding="async" className="h-full w-full rounded-md border border-border bg-surface-2 object-cover" />;
}

/** "120–100 s" breaking only after its dash, never inside a number or between a number and its unit. */
function GlanceValue({ text }: { text: string }) {
  const at = text.indexOf("\u2013");
  if (at < 0) return <span className="[overflow-wrap:normal]">{text}</span>;
  return (
    <>
      <span className="whitespace-nowrap">{text.slice(0, at + 1)}</span>
      <wbr />
      <span className="whitespace-nowrap">{text.slice(at + 1)}</span>
    </>
  );
}

function KitRow({ intel, testId }: { intel: ChampionIntelView; testId: string }) {
  const abilities = intel.abilities;
  if (!abilities) return null;
  const name = intel.champion.name;
  return (
    <div className="space-y-1" data-testid={testId} data-champion={intel.champion.id}>
      <p className="text-xs text-fg-muted">
        <span className="font-semibold text-fg">{name}</span> · base cooldowns, first to last rank or level
      </p>
      {/* Five across; three and two where five would leave a tile too narrow for its words (a phone at
          a large text size: the row is measured in rem, which grow with the text). */}
      <ol className="grid grid-cols-3 gap-1 @min-[17rem]/glance:grid-cols-5">
        {SLOTS.map((slot) => {
          const a = abilities.find((x) => x.slot === slot);
          if (!a) return <li key={slot} aria-hidden className="min-h-14 rounded-md border border-dashed border-border" />;
          // The notes' static mark, as the full tile reads it (not once Riot's data moved since the check).
          const cd = glanceCooldown(a.cooldown, { static: a.freshness !== "changed-since" && a.modifiers?.static === true });
          return (
            <li key={slot} className="flex min-w-0" data-testid="glance-ability" data-slot={slot}>
              <AbilityRefLink
                anchor={abilityAnchor(intel.champion.id, slot)}
                testId="glance-ability-link"
                className="@container/tile flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-md border border-border bg-surface px-0.5 py-1 text-center transition-colors hover:border-accent/60"
              >
                {/* As wide as the tile allows up to 32px, square: at a large text size it shrinks, never stretches. */}
                <span className="relative aspect-square w-full max-w-8">
                  <GlanceIcon src={a.icon} slot={slot} />
                  {/* The key on the icon's corner where the tile has room; on a narrower one the order (P to R) and the name say it. */}
                  <span aria-hidden className="absolute bottom-0 right-0 grid @max-[3.75rem]/tile:hidden h-4 min-w-4 place-items-center rounded-sm border border-border-strong bg-surface-2 px-0.5 text-2xs font-semibold leading-none text-fg-muted">
                    {slot}
                  </span>
                </span>
                {/* Its name is what it shows, then the whole line: "Mordekaiser Q, Obliterate: cooldown 8–4 s; in full, 8 / 7 / 6 / 5 / 4 s". */}
                <span className="sr-only">{`${name} ${SLOT_NAMES[slot]}, ${a.name}: cooldown `}</span>
                <span className={`max-w-full text-xs leading-tight tabular-nums ${cd.known ? "font-semibold text-fg" : "text-fg-muted"}`} data-testid="glance-cooldown">
                  <GlanceValue text={cd.short} />
                </span>
                {cd.full !== cd.short ? <span className="sr-only">{`; in full, ${cd.full}`}</span> : null}
              </AbilityRefLink>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The phone's first screen under the pair: the enemies' tiles with their cooldown lines, and the evidence's first row. */
export function MatchupGlance({ enemies, evidence }: { enemies: readonly ChampionIntelView[]; evidence: MatchupEvidence | null }) {
  const shown = enemies.filter((e) => !!e.abilities);
  if (!shown.length) return null;
  const row = firstEvidenceRow(evidence);
  return (
    <section aria-label="At a glance" className="@container/glance space-y-1.5 sm:hidden" data-testid="matchup-glance">
      {shown.map((intel, i) => (
        <KitRow key={intel.champion.id} intel={intel} testId={i === 0 ? "glance-enemy" : "glance-enemy2"} />
      ))}
      <p className="flex items-start gap-1.5 rounded-md border border-border bg-surface/60 px-2 py-1 text-xs leading-snug text-fg-muted" data-testid="glance-evidence">
        <Sigma className="mt-px h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
        <span className="min-w-0">
          <span className="font-semibold text-fg">Evidence:</span> {row.tier ? <span className="text-fg">{row.tier} · </span> : null}
          {row.label ? <span className="font-medium text-fg">{row.label}: </span> : null}
          <span data-testid="glance-evidence-text">{row.text}</span>
        </span>
      </p>
    </section>
  );
}
