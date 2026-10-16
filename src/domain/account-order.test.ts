import { describe, expect, it } from "vitest";
import { moveAccount, orderAccounts } from "./account-order";

const acc = (id: string, label: string, sortOrder: number | null, day: number) => ({ id, label, sortOrder, createdAt: new Date(Date.UTC(2026, 0, day)) });

describe("account order", () => {
  it("puts the Main first, then the chosen order, then the order linked", () => {
    const list = [acc("c", "alt", null, 1), acc("b", "alt", 2, 5), acc("m", "main", 9, 9), acc("a", "alt", 1, 7), acc("d", "alt", null, 3)];
    expect(orderAccounts(list).map((a) => a.id)).toEqual(["m", "a", "b", "c", "d"]);
    // Without any chosen order: the Main, then oldest first.
    expect(orderAccounts([acc("y", "alt", null, 4), acc("x", "alt", null, 2), acc("m", "main", null, 6)]).map((a) => a.id)).toEqual(["m", "x", "y"]);
  });

  it("moves alternatives up and down, never above the Main or past the ends", () => {
    const list = orderAccounts([acc("m", "main", 0, 1), acc("a", "alt", 1, 2), acc("b", "alt", 2, 3)]);
    expect(moveAccount(list, "b", -1)).toEqual(["m", "b", "a"]);
    expect(moveAccount(list, "a", -1)).toEqual(["m", "a", "b"]);
    expect(moveAccount(list, "b", 1)).toEqual(["m", "a", "b"]);
    expect(moveAccount(list, "m", 1)).toEqual(["m", "a", "b"]);
  });
});
