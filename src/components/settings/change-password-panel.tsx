"use client";

import * as React from "react";
import { changeOwnPasswordAction } from "@/server/actions/users";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

/** Your password: the current one re-authenticates the change, the new one is typed twice. */
export function ChangePasswordPanel({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirmValue, setConfirmValue] = React.useState("");
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const mismatch = confirmValue.length > 0 && confirmValue !== next;
  return (
    <Panel className={hasPassword ? undefined : "border-warn/50"} id="password">
      <PanelHeader title={hasPassword ? "PASSWORD" : "SET A PASSWORD"} subtitle={hasPassword ? "Enter your current password to confirm it is you. Changing it signs out your other devices." : "Your account has no password yet. Set one now so you can sign in again after this session ends or on another device."} />
      <PanelBody className="flex flex-wrap items-end gap-3">
        {hasPassword ? (
          <div>
            <Label htmlFor="current">Current password</Label>
            <Input id="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
        ) : null}
        <div>
          <Label htmlFor="next">New password (10+ characters with a number)</Label>
          <Input id="next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </div>
        <div>
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" type="password" value={confirmValue} onChange={(e) => setConfirmValue(e.target.value)} autoComplete="new-password" aria-invalid={mismatch} />
        </div>
        <Button
          variant={hasPassword ? "outline" : "primary"}
          disabled={busy || (hasPassword && !current) || !next || next !== confirmValue}
          onClick={async () => {
            setBusy(true);
            const r = await changeOwnPasswordAction({ current, next, confirm: confirmValue });
            setBusy(false);
            setMessage(r.ok ? { tone: "good", text: hasPassword ? "Password changed. Other devices were signed out." : "Password set." } : { tone: "bad", text: r.error });
            if (r.ok) {
              setCurrent("");
              setNext("");
              setConfirmValue("");
            }
          }}
        >
          {hasPassword ? "Change password" : "Set password"}
        </Button>
        {mismatch ? <p className="w-full text-xs text-bad">The two new passwords do not match.</p> : null}
        {message ? <p className={message.tone === "good" ? "w-full text-xs text-good" : "w-full text-xs text-bad"}>{message.text}</p> : null}
      </PanelBody>
    </Panel>
  );
}
