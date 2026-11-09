import { after } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { isVerificationSession } from "@/server/auth/verification-account";
import { parseVitalsBeacon } from "@/domain/web-vitals";
import { fieldMetricsEnabled, recordVitals } from "@/server/observability/web-vitals";

export const dynamic = "force-dynamic";

/** Beacons counted per server instance and minute; the rest are dropped. */
const PER_MINUTE = 120;
let minute = { start: 0, used: 0 };

/**
 * One page view's field measurements (domain/web-vitals), sent by the members' pages when they are
 * hidden. Counted only for a signed-in member, from this site, well formed and at most 1 KB, within
 * PER_MINUTE per instance. The Production check's verification account is not a member: its loads
 * are dropped (server/auth/verification-account.ts). Always 204: the page neither waits for nor
 * reads the answer.
 */
export async function POST(request: Request) {
  const done = () => new Response(null, { status: 204 });
  if (!fieldMetricsEnabled()) return done();
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return done();
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return done();
  const text = await request.text();
  if (text.length > 1024) return done();
  let beacon: ReturnType<typeof parseVitalsBeacon>;
  try {
    beacon = parseVitalsBeacon(JSON.parse(text));
  } catch {
    return done();
  }
  if (!beacon) return done();
  const now = Date.now();
  if (now - minute.start >= 60_000) minute = { start: now, used: 0 };
  if (++minute.used > PER_MINUTE) return done();
  const session = await getSession();
  if (!session || isVerificationSession(session)) return done();
  const counted = beacon;
  after(async () => {
    try {
      await recordVitals(await getAppDb(), counted);
    } catch {
      // A measurement that cannot be stored is dropped; it never affects the page.
    }
  });
  return done();
}
