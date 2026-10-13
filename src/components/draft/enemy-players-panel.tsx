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
 * Optional enemy player names by role for one game. Nothing depends on them: they are carried
 * into the match record so the archive can say who we played. Blank is always fine.
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
    setMessage(r.ok ? "Saved." : r.error);
    if (r.ok) router.refresh();
  };
  return (
    <Panel>
      <PanelHeader title="ENEMY PLAYERS" subtitle={compact ? "Optional, if you know them." : "Optional. If you know who you are playing, note their names; they are saved with the match record. Leave blank otherwise."} />
      <PanelBody className="space-y-2">
        <div className={compact ? "grid gap-1.5 sm:grid-cols-5" : "grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5"}>
          {ROLES.map((role: Role) => (
            <label key={role} className="flex items-center gap-1.5 text-xs">
              <RoleIcon role={role} className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
              <Input value={names[role] ?? ""} disabled={!canEdit} onChange={(e) => setNames({ ...names, [role]: e.target.value })} placeholder={ROLE_LABELS[role]} maxLength={40} className="h-8 text-xs" aria-label={`Enemy ${ROLE_LABELS[role]}`} />
            </label>
          ))}
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={save} disabled={busy || !dirty}>
              {busy ? "Saving…" : "Save names"}
            </Button>
            {message ? <span className="text-xs text-fg-muted">{message}</span> : null}
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
