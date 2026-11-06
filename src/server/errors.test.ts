import { describe, expect, it, vi } from "vitest";
import { publicErrorMessage } from "./errors";
import { errorLabel as label } from "./errors";

describe("the words an action shows for an error", () => {
  it("keeps messages the app writes for people", () => {
    expect(publicErrorMessage(new Error("Logo must be 2 MB or smaller."))).toBe("Logo must be 2 MB or smaller.");
  });

  it("hides database and driver errors, which carry SQL, values or hosts", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const drizzle = Object.assign(new Error('Failed query: select * from "users" where "username" = $1\nparams: Demo Top#DEMO'), { name: "DrizzleQueryError" });
    const unique = Object.assign(new Error('duplicate key value violates unique constraint "users_username_key"'), { code: "23505" });
    const network = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:6543"), { code: "ECONNREFUSED" });
    const url = new Error("could not reach postgres://user:pw@db.example:5432/app");
    for (const err of [drizzle, unique, network, url, null, undefined, "text", {}]) expect(publicErrorMessage(err, "Could not save.")).toBe("Could not save.");
    spy.mockRestore();
  });
});

describe("errorLabel", () => {
  it("drops a query's parameters and keeps every other message", () => {
    expect(label(new Error("Failed query: select 1 where x = $1\nparams: Secret#OCE,abc"))).toBe("Failed query: select 1 where x = $1");
    expect(label(new Error("Riot answered 503 on /lol/match/v5/matches/OC1_1"))).toBe("Riot answered 503 on /lol/match/v5/matches/OC1_1");
    expect(label("plain")).toBe("plain");
  });
});
