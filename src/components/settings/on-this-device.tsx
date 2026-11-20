"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { DEVICE_ITEMS, clearAllOnDevice, clearDeviceItem, readDeviceItem, type DeviceItem } from "@/components/device-storage";

/*
  Settings → On this device (PLAN S8a; directive §7.2c): what this browser remembers for the
  account, each with Clear, and "Clear all on this device". It reads and clears this browser's
  storage only: nothing is sent to the server (no request, no action). Until the page has hydrated
  the server draws each line without its state, so nothing moves once it is read.
*/

const noop = () => () => {};

export function OnThisDevice() {
  const hydrated = React.useSyncExternalStore(noop, () => true, () => false);
  // Bumped after a Clear, so the lines read the storage again.
  const [version, setVersion] = React.useState(0);
  const states = React.useMemo(() => (hydrated ? DEVICE_ITEMS.map((i) => readDeviceItem(i)) : DEVICE_ITEMS.map(() => null)), [hydrated, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const any = states.some((s) => s !== null);
  const clear = (items: readonly DeviceItem[] | "all") => {
    if (items === "all") clearAllOnDevice();
    else for (const i of items) clearDeviceItem(i);
    setVersion((v) => v + 1);
  };
  return (
    <div className="space-y-3" data-testid="on-this-device">
      <p className="text-sm text-fg-muted">What this browser remembers. It stays on this device and is never sent to the server.</p>
      <ul className="divide-y divide-border rounded-panel border border-border">
        {DEVICE_ITEMS.map((item, n) => {
          const state = states[n];
          return (
            <li key={item.id} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" data-testid="device-item" data-item={item.id} data-stored={state ? "" : undefined}>
              {/* At least 10rem for the words (rem: it grows with the text size), so at the usual size Clear stays beside them even at 320px; with less, the button takes the next line (R7 review A3). */}
              <div className="min-w-0 flex-[1_1_10rem]">
                <p className="text-sm font-medium text-fg">{item.label}</p>
                <p className="text-xs text-fg-muted">
                  {item.where}
                  {item.perAccount ? "" : " · for everyone using this browser"} · <span data-testid="device-item-state">{hydrated ? (state ?? "Nothing kept") : " "}</span>
                </p>
              </div>
              <Button variant="ghost" size="sm" className="ms-auto" disabled={!state} onClick={() => clear([item])} aria-label={`Clear ${item.label.toLowerCase()} on this device`} data-testid="device-item-clear">
                Clear
              </Button>
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" size="sm" wrap className="h-auto min-h-7 max-w-full whitespace-normal py-1.5 text-center" disabled={!any} onClick={() => clear("all")} data-testid="device-clear-all">
        Clear all on this device
      </Button>
    </div>
  );
}
