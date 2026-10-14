"use client";

import { X } from "lucide-react";
import { MAX_ENEMY_PLAYERS } from "@/domain/scouting/enemy-slots";
import { Input } from "@/components/ui/input";

/**
 * Five optional enemy fields, always visible, in any order and with no roles: Riot IDs
 * (GameName#Tag) are scouted for the draft, plain names are kept for the match record. Leave any
 * of them empty; blanks are dropped when saved.
 */
export function EnemyNamesInput({ value, onChange, disabled = false, compact = false }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean; compact?: boolean }) {
  const rows = Array.from({ length: MAX_ENEMY_PLAYERS }, (_, i) => value[i] ?? "");
  const set = (i: number, text: string) => onChange(rows.map((v, j) => (j === i ? text : v)));
  return (
    <div className="space-y-1.5" data-testid="enemy-names">
      <ol className={compact ? "grid gap-1.5 sm:grid-cols-2 xl:grid-cols-5" : "grid gap-1.5 sm:grid-cols-2"}>
        {rows.map((v, i) => (
          <li key={i} className="relative flex items-center gap-1.5">
            <span className="w-4 shrink-0 text-right text-xs tabular-nums text-fg-subtle" aria-hidden>
              {i + 1}.
            </span>
            <Input value={v} disabled={disabled} onChange={(e) => set(i, e.target.value)} placeholder="GameName#Tag" maxLength={40} className="pr-8 md:h-9 md:text-sm" aria-label={`Enemy player ${i + 1} (optional)`} spellCheck={false} autoComplete="off" data-testid="enemy-name-field" />
            {!disabled && v ? (
              <button type="button" onClick={() => set(i, "")} className="absolute right-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-elevated hover:text-fg" aria-label={`Clear enemy player ${i + 1}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
