import { describe, expect, it } from "vitest";
import "@/server/jobs";
import { listJobs } from "./registry";
import { PROBE_LABEL, probeText, sealProbe } from "@/server/champion-builds/probe";
import { PROBE_LABEL as SCRIPT_LABEL, parseProbe, unsealProbe } from "../../../scripts/builds-probe.mjs";
import { redactIdentifiers } from "./answer-redact";

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
    expect(sealed).toMatch(/^v1\.[0-9a-f]{24}\.[0-9a-f~]+\.[0-9a-f]{32}$/);
    expect(sealed).not.toMatch(/Thresh|Leona/);
    expect(unsealProbe(sealed, "a-cron-secret")).toBe(text);
    expect(parseProbe(unsealProbe(sealed, "a-cron-secret"))).toEqual([
      { champion: "Thresh", queue: "solo" },
      { champion: "Leona", queue: "flex" },
    ]);
    // Another secret, a changed character, or not a probe: nothing.
    expect(unsealProbe(sealed, "another-secret")).toBeNull();
    expect(unsealProbe(sealed.slice(0, -2) + (sealed.endsWith("a") ? "bb" : "aa"), "a-cron-secret")).toBeNull();
    expect(unsealProbe("v2.a.b.c", "a-cron-secret")).toBeNull();
    expect(unsealProbe(null, "a-cron-secret")).toBeNull();
    // Each seal is new (a fresh IV), the same text opening from both.
    expect(sealProbe(text, "a-cron-secret")).not.toBe(sealed);
  });

  it("passes through the jobs endpoint's redaction untouched, however long the champions' names", () => {
    const long = probeText([
      { champion: "MonkeyKing", queue: "clash" },
      { champion: "AurelionSol", queue: "draft" },
    ]);
    for (let i = 0; i < 50; i++) {
      const sealed = sealProbe(long, `secret-${i}`)!;
      expect(redactIdentifiers(JSON.stringify({ probeSealed: sealed }))).toBe(JSON.stringify({ probeSealed: sealed }));
      expect(unsealProbe(sealed, `secret-${i}`)).toBe(long);
    }
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
