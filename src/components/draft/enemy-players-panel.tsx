"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import type { EnemyPlayerNames } from "@/server/db/schema";
import { setEnemyPlayersAction } from "@/server/actions/drafts";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

/**
 * Optional enemy players by role for one game. A Riot ID (GameName#TAG) is scouted for this
 * draft only (likely picks, rank); a plain name is simply kept for the match record. Blank is
 * always fine and nothing waits for Riot.
 */
export function EnemyPlayersPanel({ draftId, initial, canEdit, compact = false }: { draftId: string; initial: EnemyPlayerNames; canEdit: boolean; compact?: boolean }) {
  const router = useRouter();
  const [names, setNames] = React.useState<EnemyPlayerNames>(initial);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const dirty = ROLES.some((r) => (names[r] ?? "") !== (initial[r] ?? ""));
  const save = async () => {
    setBusy(true);
    setMessage(null);
    const r = await setEnemyPlayersAction(draftId, names);
    setBusy(false);
    setMessage(r.ok ? (ROLES.some((role) => (names[role] ?? "").includes("#")) ? "Saved. Riot IDs are being scouted in the background; likely picks appear within a minute." : "Saved.") : r.error);
    if (r.ok) router.refresh();
  };
  return (
    <Panel>
      <PanelHeader title="ENEMY PLAYERS" subtitle={compact ? "Optional. Riot IDs (GameName#TAG) are scouted for this draft; names are kept for the record." : "Optional. Enter Riot IDs (GameName#TAG) to scout their likely picks for this draft, or just names for the match record. Any number of them; leave the rest blank."} />
      <PanelBody className="space-y-2">
        <div className={compact ? "grid gap-1.5 sm:grid-cols-5" : "grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5"}>
          {ROLES.map((role: Role) => (
            <label key={role} className="flex items-center gap-1.5 text-xs">
              <RoleIcon role={role} className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
              <Input value={names[role] ?? ""} disabled={!canEdit} onChange={(e) => setNames({ ...names, [role]: e.target.value })} placeholder={`${ROLE_LABELS[role]} Riot ID or name`} maxLength={40} className="md:h-8 md:text-xs" aria-label={`Enemy ${ROLE_LABELS[role]}`} spellCheck={false} />
            </label>
          ))}
        </div>
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
