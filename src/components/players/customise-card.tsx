"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Paintbrush } from "lucide-react";
import { ACCENT_COLOR, ACCENT_LABEL, CARD_ACCENTS, championArtUrl, type CardAccent, type CardArt } from "@/domain/player-card";
import { listChampionSkinsAction, setCardStyleAction } from "@/server/actions/players";
import type { PickerChampion } from "@/components/champions/types";
import { ChampionGrid } from "@/components/champions/champion-grid";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { CardArtLayer } from "./card-art";

export interface CustomiseCardProps {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  art: CardArt | null;
  accent: CardAccent;
  /** Every champion (search) and the player's own pool champions (listed first). */
  champions: PickerChampion[];
  poolIds: string[];
}

/** Skins already fetched in this tab, per champion. */
const skinCache = new Map<string, Array<{ num: number; name: string }>>();

/**
 * The Customise button on your own card (Team, Players, the profile header) and its dialog:
 * 1. featured champion (your pools first, any champion by search), 2. skin artwork from
 * thumbnails, 3. accent; a live preview; Save. One saved choice drives every card.
 */
export function CustomiseCardButton(props: CustomiseCardProps & { variant?: "overlay" | "outline" | "icon"; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const icon = props.variant === "icon";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors",
          icon ? "h-8 w-8 rounded-full bg-bg/65 text-fg-muted backdrop-blur-sm hover:bg-bg/85 hover:text-accent pointer-coarse:h-11 pointer-coarse:w-11" : "min-h-9 px-2.5 pointer-coarse:min-h-11",
          !icon && (props.variant === "outline" ? "border border-border-strong bg-surface/70 text-fg hover:border-accent hover:text-accent" : "bg-bg/65 text-fg backdrop-blur-sm hover:bg-bg/85 hover:text-accent"),
          props.className,
        )}
        aria-label="Personalise my card"
        title="Personalise your card: champion, skin and accent"
        data-testid="customise-card"
      >
        <Paintbrush className={icon ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden /> {icon ? null : <span>Personalise</span>}
      </button>
      {open ? <CustomiseCardDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CustomiseCardDialog({ playerId, name, avatarUrl, art, accent, champions, poolIds, onClose }: CustomiseCardProps & { onClose: () => void }) {
  const router = useRouter();
  const [championId, setChampionId] = React.useState<string | null>(art?.championId ?? poolIds[0] ?? null);
  const [skinNum, setSkinNum] = React.useState(art?.skinNum ?? 0);
  const [colour, setColour] = React.useState<CardAccent>(accent);
  const [skins, setSkins] = React.useState<Array<{ num: number; name: string }> | null>(championId ? (skinCache.get(championId) ?? null) : []);
  const [busy, setBusy] = React.useState(false);
  const pool = React.useMemo(() => new Set(poolIds), [poolIds]);
  const champName = champions.find((c) => c.id === championId)?.name ?? championId ?? "";

  React.useEffect(() => {
    if (!championId || skinCache.has(championId)) return;
    let live = true;
    void listChampionSkinsAction(championId).then((r) => {
      const list = r.ok && r.data?.length ? r.data : [{ num: 0, name: "Default" }];
      skinCache.set(championId, list);
      if (live) setSkins(list);
    });
    return () => {
      live = false;
    };
  }, [championId]);

  const pickChampion = (id: string) => {
    if (id === championId) return;
    setChampionId(id);
    setSkinNum(0);
    setSkins(skinCache.get(id) ?? null);
  };

  const save = async () => {
    setBusy(true);
    const r = await setCardStyleAction(playerId, { featuredChampionId: championId, featuredSkinNum: skinNum, cardAccent: colour });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Card updated.", { description: "It shows on Team, Players and your profile." });
    onClose();
    router.refresh();
  };

  const preview: CardArt | null = championId ? { championId, skinNum } : null;
  const skinName = skins?.find((s) => s.num === skinNum)?.name;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Personalise your card"
      description="Pick the champion and artwork shown on your Team card, Players card and profile. Any skin can be shown; it does not mean you own it."
      className="sm:max-w-4xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !championId} data-testid="save-card-style">
            {busy ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        {/* Live preview, the same art layer the real cards use. */}
        <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
          <div className="relative h-40 overflow-hidden rounded-xl border border-border bg-surface" data-testid="card-preview">
            <CardArtLayer art={preview} accent={ACCENT_COLOR[colour]} kind="splash" />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-2.5 p-3">
              <Avatar name={name} src={avatarUrl} size="md" ring="accent" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-fg drop-shadow">{name}</span>
                <span className="block truncate text-xs text-fg-muted">{champName ? `${champName}${skinName && skinNum > 0 ? ` · ${skinName}` : ""}` : "No champion chosen"}</span>
              </span>
            </div>
            <span className="absolute left-3 top-3 h-1.5 w-10 rounded-full" style={{ background: ACCENT_COLOR[colour] }} aria-hidden />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-muted">Accent</div>
            <div role="radiogroup" aria-label="Card accent" className="flex flex-wrap gap-2">
              {CARD_ACCENTS.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={colour === a} aria-label={ACCENT_LABEL[a]} title={ACCENT_LABEL[a]} onClick={() => setColour(a)} className={cn("grid h-9 w-9 place-items-center rounded-full border-2 transition-transform motion-safe:hover:scale-105", colour === a ? "border-fg" : "border-transparent")} style={{ background: ACCENT_COLOR[a] }}>
                  {colour === a ? <Check className="h-4 w-4 text-bg" aria-hidden /> : null}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <section>
            <h3 className="mb-1.5 text-sm font-semibold text-fg">1 · Champion</h3>
            <ChampionGrid champions={champions} selectedIds={new Set(championId ? [championId] : [])} onPick={pickChampion} prioritisedIds={pool} prioritisedLabel="in your pools" maxHeight={210} size="sm" testId="customise-champions" placeholder="Search any champion…" progressive />
          </section>
          <section>
            <h3 className="mb-1.5 text-sm font-semibold text-fg">2 · Artwork {champName ? <span className="font-normal text-fg-subtle">· {champName}</span> : null}</h3>
            {!championId ? (
              <p className="text-sm text-fg-subtle">Choose a champion first.</p>
            ) : skins === null ? (
              <p className="text-sm text-fg-subtle" aria-live="polite">
                Loading skins…
              </p>
            ) : (
              <SkinChooser key={championId} championId={championId} skins={skins} value={skinNum} onChange={setSkinNum} />
            )}
            {skins && skins.length === 1 ? <p className="mt-1.5 text-xs text-fg-subtle">Only the default art is known for now; new skins appear automatically after the next champion update.</p> : null}
          </section>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * The artwork choice: one thumbnail per distinct illustration (chromas and duplicate images are
 * left out on the server), default first, searchable by name. A thumbnail whose image cannot load
 * removes its whole option rather than leaving a blank card.
 */
function SkinChooser({ championId, skins, value, onChange }: { championId: string; skins: Array<{ num: number; name: string }>; value: number; onChange: (num: number) => void }) {
  const [query, setQuery] = React.useState("");
  const [broken, setBroken] = React.useState<Set<number>>(() => new Set());
  const q = query.trim().toLowerCase();
  const shown = skins.filter((s) => !broken.has(s.num) && (!q || s.name.toLowerCase().includes(q) || s.num === 0));
  return (
    <div className="space-y-2">
      {skins.length > 8 ? (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${skins.length - 1} skins…`}
          aria-label="Search skins"
          className="h-9 w-full rounded-lg border border-border bg-bg-elevated px-3 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent"
          data-testid="skin-search"
        />
      ) : null}
      <ul role="radiogroup" aria-label="Skin artwork" className="grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-5 xl:grid-cols-6" data-testid="skin-options">
        {shown.map((s) => {
          const on = s.num === value;
          return (
            <li key={s.num}>
              <button type="button" role="radio" aria-checked={on} onClick={() => onChange(s.num)} title={s.name} className={cn("group w-full overflow-hidden rounded-lg border text-left transition-colors", on ? "border-accent ring-2 ring-accent" : "border-border hover:border-border-strong")} data-testid="skin-option" data-num={s.num}>
                <span className="relative block aspect-[4/5] overflow-hidden bg-surface-2">
                  {/* Loading-screen art is small (a few dozen KB): fine as a thumbnail. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={championArtUrl({ championId, skinNum: s.num }, "loading")}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover object-top transition-transform motion-safe:group-hover:scale-105"
                    onError={() => {
                      if (s.num !== 0) setBroken((b) => new Set(b).add(s.num));
                    }}
                  />
                  {on ? (
                    <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-accent text-bg">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span className="block truncate px-1.5 py-1 text-[11px] text-fg">{s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {q && shown.length <= 1 ? <p className="text-xs text-fg-subtle">No skin matches “{query}”.</p> : null}
    </div>
  );
}
