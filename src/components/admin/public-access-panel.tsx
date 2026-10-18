"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { setPublicAccessAction } from "@/server/actions/public-access";

/** Admin → Public Access: the team-wide switch for the public pages. */
export function PublicAccessSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  const [value, setValue] = React.useState(on);
  const [busy, setBusy] = React.useState(false);
  const change = async (next: boolean) => {
    setBusy(true);
    setValue(next);
    const r = await setPublicAccessAction(next);
    setBusy(false);
    if (!r.ok) {
      setValue(!next);
      return toast.error(r.error);
    }
    toast.success(next ? "The public page is on." : "The public page is off.");
    router.refresh();
  };
  return <Switch id="public-access" checked={value} disabled={busy} onChange={(v) => void change(v)} label="Public team page" description="Visitors without an account can open the team's public page. Members appear on it only if they chose to in their own Settings." />;
}
