"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { EnemyPlayerNames } from "@/server/db/schema";
import { enemyNameList, enemySlotsFromList } from "@/domain/scouting/enemy-slots";
import { setEnemyPlayersAction } from "@/server/actions/drafts";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { EnemyNamesInput } from "./enemy-names-input";

/**
 * Optional enemy players for one game, in any order and without roles. A Riot ID (GameName#TAG) is scouted for this
 * draft only (likely picks, rank); a plain name is simply kept for the match record. Blank is
 * always fine and nothing waits for Riot.
 */
export function EnemyPlayersPanel({ draftId, initial, canEdit, compact = false }: { draftId: string; initial: EnemyPlayerNames; canEdit: boolean; compact?: boolean }) {
  const router = useRouter();
  const initialList = enemyNameList(initial);
  const [names, setNames] = React.useState<string[]>(initialList);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const dirty = clean.join("\n") !== initialList.join("\n");
  const save = async () => {
    setBusy(true);
    setMessage(null);
    const r = await setEnemyPlayersAction(draftId, enemySlotsFromList(clean));
    setBusy(false);
    setMessage(r.ok ? (clean.some((n) => n.includes("#")) ? "Saved. Riot IDs are being scouted in the background; likely picks appear within a minute." : "Saved.") : r.error);
    if (r.ok) router.refresh();
  };
  return (
    <Panel>
      <PanelHeader title="ENEMY PLAYERS — OPTIONAL" subtitle={compact ? "Riot IDs (GameName#Tag) in any order, no roles needed; names are kept for the record." : "Riot IDs (GameName#Tag) in any order and without roles: each player's likely role and picks come from their own games. Plain names are kept for the match record. None is fine."} />
      <PanelBody className="space-y-2">
        <EnemyNamesInput value={names} onChange={setNames} disabled={!canEdit} compact={compact} />
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save enemy players"}
            </Button>
            {message ? <span className="text-xs text-fg-muted">{message}</span> : null}
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
