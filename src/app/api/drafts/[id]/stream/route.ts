import type { NextRequest } from "next/server";
import { getAuthState, needsSetup } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getDraftLiveState, removePresence, touchPresence } from "@/server/live/draft-live";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Server-Sent Events stream for a draft: pushes version/owner/viewer changes so every open
 * browser updates instantly without a page refresh. Browsers reconnect automatically when the
 * connection ends (hosting time limits), and the client re-fetches on every version change, so
 * nothing is lost across reconnects. Works on any host that supports streaming responses.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (!auth.session) return new Response("Unauthorised", { status: 401 });
  if (needsSetup(auth.session)) return new Response("Finish your setup first", { status: 403 });
  const session = auth.session;
  const clientId = request.nextUrl.searchParams.get("client") ?? crypto.randomUUID();
  const encoder = new TextEncoder();
  const pollMs = Number(process.env.UNIIVERSE_LIVE_POLL_MS ?? 2000);
  const lifetimeMs = Number(process.env.UNIIVERSE_LIVE_LIFETIME_MS ?? 240_000);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      let lastVersion = -1;
      let lastViewers = "";
      let lastPresenceTouch = 0;
      const started = Date.now();
      const tick = async () => {
        if (closed) return;
        try {
          if (Date.now() - lastPresenceTouch > 15_000) {
            await touchPresence(db, id, clientId, session.userId, session.label);
            lastPresenceTouch = Date.now();
          }
          const state = await getDraftLiveState(db, id);
          if (!state) {
            send("gone", {});
            closed = true;
            controller.close();
            return;
          }
          if (state.version !== lastVersion) {
            lastVersion = state.version;
            send("version", { version: state.version, status: state.status, ownerUserId: state.ownerUserId, ownerLabel: state.ownerLabel });
          }
          const viewersKey = state.viewers.map((v) => `${v.clientId}:${v.label}`).sort().join("|");
          if (viewersKey !== lastViewers) {
            lastViewers = viewersKey;
            send("presence", { viewers: state.viewers });
          }
        } catch (err) {
          send("error", { message: (err as Error).message });
        }
        if (Date.now() - started > lifetimeMs) {
          send("reconnect", {});
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          return;
        }
        setTimeout(tick, pollMs);
      };
      send("hello", { clientId });
      void tick();
      request.signal.addEventListener("abort", () => {
        closed = true;
        void removePresence(db, id, clientId);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
