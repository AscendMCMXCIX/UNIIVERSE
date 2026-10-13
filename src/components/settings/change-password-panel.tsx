"use client";

import * as React from "react";
import { changeOwnPasswordAction } from "@/server/actions/users";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";

/** Change the password, or set the first one for an account created without. */
export function ChangePasswordPanel({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [message, setMessage] = React.useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <Panel className={hasPassword ? undefined : "border-warn/50"}>
      <PanelHeader title={hasPassword ? "PASSWORD" : "SET A PASSWORD"} subtitle={hasPassword ? "Changing it signs out your other devices." : "Your account has no password yet. You stay signed in here, but you will need one to sign in from another device or after this session expires."} />
      <PanelBody className="flex flex-wrap items-end gap-3">
        {hasPassword ? (
          <div>
            <Label htmlFor="current">Current password</Label>
            <Input id="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
        ) : null}
        <div>
          <Label htmlFor="next">{hasPassword ? "New password" : "Password (10+ characters, letters and a number)"}</Label>
          <Input id="next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </div>
        <Button
          variant={hasPassword ? "outline" : "primary"}
          disabled={busy || (hasPassword && !current) || !next}
          onClick={async () => {
            setBusy(true);
            const r = await changeOwnPasswordAction({ current, next });
            setBusy(false);
            setMessage(r.ok ? { tone: "good", text: hasPassword ? "Password changed. Other devices were signed out." : "Password set. You can now sign in from any device." } : { tone: "bad", text: r.error });
            if (r.ok) {
              setCurrent("");
              setNext("");
            }
          }}
        >
          {hasPassword ? "Change password" : "Set password"}
        </Button>
        {message ? <p className={message.tone === "good" ? "text-xs text-good" : "text-xs text-bad"}>{message.text}</p> : null}
      </PanelBody>
    </Panel>
  );
}
