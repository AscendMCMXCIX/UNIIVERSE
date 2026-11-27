import { describe, expect, it } from "vitest";
import "@/server/jobs";
import { listJobs } from "./registry";
import { PROBE_LABEL, probeText, sealProbe } from "@/server/champion-builds/probe";
import { PROBE_LABEL as SCRIPT_LABEL, parseProbe, unsealProbe } from "../../../scripts/builds-probe.mjs";

/*
  The builds audit's probe (docs/LIVE_VALIDATION.md, "The builds audit"): the app seals the two
  champions the Production check opens under CRON_SECRET, and the workflow's script
  (scripts/builds-probe.mjs) opens them with the same derivation: held equal here, so a change to
  one fails until the other follows. Only the right secret opens it; the sealed text names nothing.
*/

describe("the builds audit's probe", () => {
  it("is opened by the workflow's script with the secret it was sealed under, and by nothing else", () => {
    expect(SCRIPT_LABEL).toBe(PROBE_LABEL);
    const text = probeText([
      { champion: "Thresh", queue: "solo" },
      { champion: "Leona", queue: "flex" },
    ]);
    expect(text).toBe("Thresh:solo,Leona:flex");
    const sealed = sealProbe(text, "a-cron-secret")!;
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toMatch(/Thresh|Leona/);
    expect(unsealProbe(sealed, "a-cron-secret")).toBe(text);
    expect(parseProbe(unsealProbe(sealed, "a-cron-secret"))).toEqual([
      { champion: "Thresh", queue: "solo" },
      { champion: "Leona", queue: "flex" },
    ]);
    // Another secret, a changed character, or not a probe: nothing.
    expect(unsealProbe(sealed, "another-secret")).toBeNull();
    expect(unsealProbe(sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA"), "a-cron-secret")).toBeNull();
    expect(unsealProbe("v2.a.b.c", "a-cron-secret")).toBeNull();
    expect(unsealProbe(null, "a-cron-secret")).toBeNull();
    // Each seal is new (a fresh IV), the same text opening from both.
    expect(sealProbe(text, "a-cron-secret")).not.toBe(sealed);
  });

  it("carries only champion ids and queues; seals nothing without a secret or a champion", () => {
    expect(probeText([{ champion: "Kai'Sa<script>", queue: "solo" }, { champion: "Kaisa", queue: "clash" }])).toBe("Kaisa:clash");
    expect(sealProbe("Thresh:solo", undefined)).toBeNull();
    expect(sealProbe("", "a-cron-secret")).toBeNull();
    expect(parseProbe("Thresh:solo,bad entry,Leona:aram,Nasus:draft")).toEqual([
      { champion: "Thresh", queue: "solo" },
      { champion: "Nasus", queue: "draft" },
    ]);
  });
});

describe("the builds audit job", () => {
  it("is a check run by hand or by the Production check, never by the scheduler, its cost said", () => {
    const job = listJobs().find((j) => j.key === "builds-audit");
    expect(job?.kind).toBe("check");
    expect(job?.defaultIntervalMinutes).toBeNull();
    expect(job?.allowConcurrent).toBe(true);
    expect(job?.cost).toMatch(/KB/);
  });
});
