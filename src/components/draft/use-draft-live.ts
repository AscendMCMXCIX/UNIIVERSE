"use client";

import * as React from "react";

export interface LiveViewer {
  clientId: string;
  userId: string | null;
  label: string;
}

export interface LiveStatus {
  connected: boolean;
  version: number | null;
  controllerUserId: string | null;
  controllerLabel: string | null;
  viewers: LiveViewer[];
}

/**
 * Subscribes to a draft's event stream. Calls `onVersion` whenever the server version moves past
 * what this client has, so the room re-fetches. Reconnects automatically (EventSource) and keeps a
 * stable client id for presence across reconnects.
 */
export function useDraftLive(draftId: string, localVersion: number, onVersion: (version: number) => void): LiveStatus {
  const [status, setStatus] = React.useState<LiveStatus>({ connected: false, version: null, controllerUserId: null, controllerLabel: null, viewers: [] });
  const clientId = React.useRef<string>("");
  const latest = React.useRef(localVersion);
  const handler = React.useRef(onVersion);
  React.useEffect(() => {
    latest.current = localVersion;
    handler.current = onVersion;
  });

  React.useEffect(() => {
    if (!clientId.current) {
      try {
        clientId.current = sessionStorage.getItem("uniiverse-client-id") || crypto.randomUUID();
        sessionStorage.setItem("uniiverse-client-id", clientId.current);
      } catch {
        clientId.current = crypto.randomUUID();
      }
    }
    const source = new EventSource(`/api/drafts/${draftId}/stream?client=${encodeURIComponent(clientId.current)}`);
    source.onopen = () => setStatus((s) => ({ ...s, connected: true }));
    source.onerror = () => setStatus((s) => ({ ...s, connected: false }));
    source.addEventListener("version", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { version: number; controllerUserId: string | null; controllerLabel: string | null };
      setStatus((s) => ({ ...s, version: data.version, controllerUserId: data.controllerUserId, controllerLabel: data.controllerLabel }));
      if (data.version > latest.current) handler.current(data.version);
    });
    source.addEventListener("presence", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { viewers: LiveViewer[] };
      setStatus((s) => ({ ...s, viewers: data.viewers }));
    });
    source.addEventListener("reconnect", () => {
      // Server ended the stream deliberately (host time limit); EventSource reconnects on close.
    });
    return () => source.close();
  }, [draftId]);

  return status;
}
