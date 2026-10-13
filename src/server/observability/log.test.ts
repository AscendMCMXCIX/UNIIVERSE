import { describe, expect, it } from "vitest";
import { redact, Timings } from "./log";

describe("structured logging", () => {
  it("redacts secrets by key and by shape, keeps ordinary fields", () => {
    const out = redact({ username: "Ascend", password: "hunter2", RIOT_API_KEY: "RGAPI-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", nested: { session: "s1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", note: "fine" }, url: "postgres://u:p@host/db", jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig" }) as Record<string, unknown>;
    expect(out.username).toBe("Ascend");
    expect(out.password).toBe("[redacted]");
    expect(out.RIOT_API_KEY).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).session).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).note).toBe("fine");
    expect(out.url).toBe("[redacted]");
    expect(out.jwt).toBe("[redacted]");
  });

  it("sums timings per step and reports a total", () => {
    const t = new Timings();
    t.add("db", 12.3);
    t.add("db", 7.7);
    t.add("engine", 100);
    const s = t.summary();
    expect(s.db).toBe(20);
    expect(s.engine).toBe(100);
    expect(s.total).toBeGreaterThanOrEqual(0);
  });
});
