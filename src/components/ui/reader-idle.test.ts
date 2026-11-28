import { describe, expect, it } from "vitest";
import { READER_IDLE_MS, readerBusy } from "./reader-idle";

describe("a list's own address write waits while the reader acts", () => {
  it("is busy within READER_IDLE_MS of the last press, click or key, and idle after", () => {
    expect(readerBusy(1000, -Infinity)).toBe(false);
    expect(readerBusy(1000, 900)).toBe(true);
    expect(readerBusy(1000 + READER_IDLE_MS, 1000)).toBe(false);
    expect(readerBusy(1000 + READER_IDLE_MS - 1, 1000)).toBe(true);
  });
});
