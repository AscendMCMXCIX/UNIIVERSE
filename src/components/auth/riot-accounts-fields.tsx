"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export interface RiotRow {
  riotId: string;
  platform: string;
}

/**
 * Primary Riot ID plus optional additional accounts. Renders plain form fields (names
 * `riotId`/`platform` and repeated `extraRiotId`/`extraPlatform`) so it works inside server-
 * action forms, and reports changes for client-side forms too.
 */
export function RiotAccountsFields({ defaultPlatform, initial, onChange, compact = false }: { defaultPlatform: string; initial?: { primary?: RiotRow; extras?: RiotRow[] }; onChange?: (value: { primary: RiotRow; extras: RiotRow[] }) => void; compact?: boolean }) {
  const [primary, setPrimary] = React.useState<RiotRow>(initial?.primary ?? { riotId: "", platform: defaultPlatform });
  const [extras, setExtras] = React.useState<RiotRow[]>(initial?.extras ?? []);
  const emit = (p: RiotRow, e: RiotRow[]) => onChange?.({ primary: p, extras: e });
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="riotId">PRIMARY RIOT ID *</Label>
        <Input id="riotId" name="riotId" value={primary.riotId} onChange={(e) => { const p = { ...primary, riotId: e.target.value }; setPrimary(p); emit(p, extras); }} placeholder="GameName#TAG" spellCheck={false} autoComplete="off" required />
        {/* The server is confirmed by Riot during verification; the configured default is only a fallback. */}
        <input type="hidden" name="platform" value={primary.platform} />
        {!compact ? <p className="mt-1 text-xs text-fg-subtle">Exactly as shown in the League client, including the #TAG. Unicode names are fine; the server you play on is confirmed by Riot automatically.</p> : null}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label>ADDITIONAL RIOT ACCOUNTS (optional)</Label>
          <Button type="button" size="sm" variant="ghost" onClick={() => { const e = [...extras, { riotId: "", platform: primary.platform }]; setExtras(e); emit(primary, e); }}>
            <Plus className="h-3.5 w-3.5" /> Add another account
          </Button>
        </div>
        <p className="text-xs text-fg-subtle">Alts and smurfs welcome: every account adds its games and mastery to your champion proficiency, so recommendations see your real experience. Each account is identified by its permanent Riot identity and never counted twice.</p>
        {extras.map((row, i) => (
          <div key={i} className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input name="extraRiotId" value={row.riotId} onChange={(e) => { const next = extras.map((r, j) => (j === i ? { ...r, riotId: e.target.value } : r)); setExtras(next); emit(primary, next); }} placeholder="GameName#TAG" spellCheck={false} autoComplete="off" aria-label={`Additional Riot ID ${i + 1}`} />
            </div>
            <input type="hidden" name="extraPlatform" value={row.platform} />
            <Button type="button" size="sm" variant="ghost" aria-label="Remove account" onClick={() => { const next = extras.filter((_, j) => j !== i); setExtras(next); emit(primary, next); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
