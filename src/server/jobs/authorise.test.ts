import { describe, expect, it } from "vitest";
import { jobRequestAuthorised } from "./authorise";

describe("jobRequestAuthorised", () => {
  const secret = "s3cret-value-for-tests";
  it("accepts the secret as a bearer token", () => {
    expect(jobRequestAuthorised(`Bearer ${secret}`, secret)).toBe(true);
  });
  it("refuses anything else: a wrong, shorter, longer or missing token, or another scheme", () => {
    expect(jobRequestAuthorised("Bearer wrong", secret)).toBe(false);
    expect(jobRequestAuthorised(`Bearer ${secret.slice(0, -1)}`, secret)).toBe(false);
    expect(jobRequestAuthorised(`Bearer ${secret}x`, secret)).toBe(false);
    expect(jobRequestAuthorised(null, secret)).toBe(false);
    expect(jobRequestAuthorised("", secret)).toBe(false);
    expect(jobRequestAuthorised(`Basic ${secret}`, secret)).toBe(false);
    expect(jobRequestAuthorised(secret, secret)).toBe(false);
  });
  it("never accepts anything when no secret is configured", () => {
    expect(jobRequestAuthorised("Bearer ", "")).toBe(false);
  });
});
