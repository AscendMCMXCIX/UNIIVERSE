"use client";

import { Plus, X } from "lucide-react";
import { MAX_ENEMY_PLAYERS } from "@/domain/scouting/enemy-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Zero to five enemy players, in any order, with no roles to assign: Riot IDs (GameName#TAG) are
 * scouted for the draft, plain names are kept for the match record.
 */
export function EnemyNamesInput({ value, onChange, disabled = false, compact = false }: { value: string[]; onChange: (next: string[]) => void; disabled?: boolean; compact?: boolean }) {
  const rows = value.length ? value : [""];
  const set = (i: number, text: string) => onChange(rows.map((v, j) => (j === i ? text : v)));
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i));
  return (
    <div className="space-y-1.5" data-testid="enemy-names">
      <ul className={compact ? "grid gap-1.5 sm:grid-cols-2 xl:grid-cols-5" : "grid gap-1.5 sm:grid-cols-2"}>
        {rows.map((v, i) => (
          <li key={i} className="flex items-center gap-1">
            <Input value={v} disabled={disabled} onChange={(e) => set(i, e.target.value)} placeholder="GameName#Tag" maxLength={40} className="md:h-8 md:text-xs" aria-label={`Enemy player ${i + 1}`} spellCheck={false} autoComplete="off" />
            {!disabled && (rows.length > 1 || v) ? (
              <button type="button" onClick={() => remove(i)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-elevated hover:text-fg" aria-label={`Remove enemy player ${i + 1}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!disabled && rows.length < MAX_ENEMY_PLAYERS ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange([...rows, ""])}>
          <Plus className="h-3.5 w-3.5" /> Add player
        </Button>
      ) : null}
    </div>
  );
}
