import { deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { createUser } from "@/server/repositories/users";
import { getAvatar, removeAvatar, setAvatar } from "@/server/repositories/profile";
import { publicImageBytes } from "@/server/public/image-response";

/*
  Public member pictures are read from the database once a minute per server instance at most, so
  anonymous requests cannot use up the database egress; saving or removing a picture clears it.
*/

/** A minimal valid RGB PNG of the given size (real header and data, so it sniffs as a PNG). */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("public member pictures", () => {
  it("reads a picture once while it is kept, and again after it changes", async () => {
    const db = handle.db;
    const user = await createUser(db, { username: "picture-cache", password: "picture-cache-pass-1", role: "player" });
    let reads = 0;
    const load = () => {
      reads += 1;
      return getAvatar(db, user.id);
    };
    expect(await publicImageBytes(db, "avatar", user.id, load)).toBeNull();
    await setAvatar(db, user.id, png(64, 64)); // clears the entry
    const first = await publicImageBytes(db, "avatar", user.id, load);
    await Promise.all(Array.from({ length: 10 }, () => publicImageBytes(db, "avatar", user.id, load)));
    expect(first?.contentType).toBe("image/png");
    expect(reads).toBe(2);
    await removeAvatar(db, user.id);
    expect(await publicImageBytes(db, "avatar", user.id, load)).toBeNull();
    expect(reads).toBe(3);
  });
});
