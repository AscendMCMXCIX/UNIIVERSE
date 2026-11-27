import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createNodeInlinedDataStream } from "next/dist/server/app-render/stream-ops.node";
import { createInlinedDataReadableStream } from "next/dist/server/app-render/use-flight-response";
import { RIOT_FIGURE_KEYS, RIOT_KEYS, riotFiguresOnPage, riotKeysOnPage } from "../../../scripts/riot-keys.mjs";

/*
  The live check's look at the public team page's Riot keys (scripts/riot-keys.mjs): no `puuid`,
  `gameName`, `tagLine` or `riotId` key in the page's HTML or in the RSC payload it carries. Next.js
  writes that payload into the page as `self.__next_f.push` scripts, with one of two writers, and
  every page here is written by each, cut where its stream may cut it:
  - the Node.js writer, `createNodeInlinedDataStream` (next/dist/server/app-render/stream-ops.node.js),
    writes every page a Node.js server serves: production's, and the browser tests' (`next start`).
    Next.js 16.4.3 builds every server that is not the edge runtime with `__NEXT_USE_NODE_STREAMS`
    (next/dist/build/define-env.js), and its compiled page runtimes call this writer only;
  - the web writer, `createInlinedDataReadableStream` (use-flight-response.js), writes the pages of
    the edge runtime, which UNIIVERSE does not use.
  They differ where a piece of the payload ends inside a character: the Node.js writer writes each
  such piece as bytes (base64), the web one carries the character over as text. A Next.js upgrade
  that changes what either writes fails here, in pnpm verify. One that moved pages to a third writer
  would not; if that writer's format differed, the live check would fail on production instead (no
  payload found, or a script it cannot read). Every value is made up; only counts come back.
*/

const encoder = new TextEncoder();
type Piece = string | Uint8Array;

/** The RSC payload in the pieces its stream delivered. */
function flight(pieces: readonly Piece[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(typeof piece === "string" ? encoder.encode(piece) : piece);
      controller.close();
    },
  });
}

/** The Node.js writer's scripts: it answers with a Node.js stream. */
async function nodeWriter(pieces: readonly Piece[], nonce?: string): Promise<string> {
  const out = createNodeInlinedDataStream(flight(pieces), nonce, null);
  if (!(out instanceof Readable)) throw new Error("Next.js's Node.js writer no longer answers with a Node.js stream");
  const parts: Buffer[] = [];
  for await (const part of out) parts.push(part as Buffer);
  return Buffer.concat(parts).toString("utf8");
}

/** The web writer's scripts: it answers with a web stream. */
async function webWriter(pieces: readonly Piece[], nonce?: string): Promise<string> {
  const reader = createInlinedDataReadableStream(flight(pieces), nonce, null).getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

/**
 * Next.js's two writers, and the kind of each script they write for the pieces of the test "reads a
 * character cut between two pieces": 1 is text, 3 bytes in base64.
 */
const WRITERS = [
  { name: "Node.js", write: nodeWriter, cutCharacterKinds: [3, 3, 1] },
  { name: "web", write: webWriter, cutCharacterKinds: [1, 1, 1] },
];

/** The kind of each data script in a page, in order. */
function kinds(html: string): number[] {
  return [...html.matchAll(/self\.__next_f\.push\(\[(\d+),/g)].map((m) => Number(m[1]));
}

/** One public card's player as the page's props carry it (server/public/team.ts), with the card's own motto. */
const CARD = '1:["$","div",null,{"slots":[{"role":"TOP","player":{"id":"p-1","name":"Top Shown","avatarUrl":null,"rank":null,"look":{"style":{"identity":{"tagline":"Made-up motto","emblem":null}},"bannerUrl":null},"social":[],"season":null,"statsVisible":false}}]}]\n';

for (const { name, write, cutCharacterKinds } of WRITERS) describe(`the public team page's Riot keys, its payload written by Next.js's ${name} writer`, () => {
  /** A page as Next.js serves it: some HTML, then the payload's scripts. */
  async function page(pieces: readonly Piece[], html = "<!DOCTYPE html><html><body><main>Team</main>", nonce?: string): Promise<string> {
    return `${html}${await write(pieces, nonce)}</body></html>`;
  }

  it("reads a page with none: the public card's fields, the card's own tagline and text about Riot IDs", async () => {
    const html = await page(['0:{"P":null,"b":"build"}\n', CARD], "<!DOCTYPE html><html><body><main><p>Riot IDs and PUUIDs are never shown here.</p></main>", "n0nce");
    expect(riotKeysOnPage(html)).toEqual({ keys: { puuid: 0, gameName: 0, tagLine: 0, riotId: 0 }, total: 0, chunks: 2, unreadable: 0 });
  });

  it("finds a key wherever the stream cuts the payload, even where no script holds the whole key", async () => {
    const payload = '0:{"P":null}\n1:{"player":{"id":"p-1","gameName":"Made Up"}}\n';
    const at = payload.indexOf('"gameName"');
    for (let cut = at - 1; cut <= at + '"gameName":'.length + 1; cut++) {
      const html = await page([payload.slice(0, cut), payload.slice(cut)]);
      expect(riotKeysOnPage(html), `cut at ${cut - at}`).toMatchObject({ keys: { puuid: 0, gameName: 1, tagLine: 0, riotId: 0 }, total: 1, chunks: 2, unreadable: 0 });
    }
    // Cut inside the name, the key is in no script whole: a search of the HTML alone misses it.
    expect(await page([payload.slice(0, at + 5), payload.slice(at + 5)])).not.toContain("gameName");
  });

  it("finds each key in every form a page can carry it, and counts each one", async () => {
    // In the payload: a key, and a key in JSON inside a string. In the HTML: a JSON script block and JSON in an attribute.
    const html = await page(['0:{"puuid":"made-up","riotId":null,"notes":"{\\"tagLine\\":\\"X\\"}"}\n'], '<!DOCTYPE html><html><body><script type="application/json">{"puuid":"made-up","list":[{"gameName":"x"}]}</script><div data-props="{&quot;riotId&quot;:1}"></div>');
    expect(riotKeysOnPage(html)).toEqual({ keys: { puuid: 2, gameName: 1, tagLine: 1, riotId: 2 }, total: 6, chunks: 1, unreadable: 0 });
  });

  it("reads a piece written as bytes (not valid UTF-8) with the text around it", async () => {
    const html = await page(['0:{"a":1,"', new Uint8Array([0xff, ...encoder.encode('x":2,"riot')]), 'Id":3}\n']);
    expect(kinds(html)).toEqual([1, 3, 1]);
    expect(riotKeysOnPage(html)).toEqual({ keys: { puuid: 0, gameName: 0, tagLine: 0, riotId: 1 }, total: 1, chunks: 3, unreadable: 0 });
  });

  it("reads a character cut between two pieces, and a key cut after it", async () => {
    // "é" is two bytes in UTF-8; the first piece ends between them, the second inside "riotId".
    const head = encoder.encode('0:{"tagline":"Café crew","riot');
    const inCharacter = head.indexOf(0xc3) + 1;
    const html = await page([head.slice(0, inCharacter), head.slice(inCharacter), 'Id":null}\n']);
    expect(kinds(html)).toEqual(cutCharacterKinds);
    expect(riotKeysOnPage(html)).toEqual({ keys: { puuid: 0, gameName: 0, tagLine: 0, riotId: 1 }, total: 1, chunks: 3, unreadable: 0 });
  });

  it("returns counts only, never a value from the page", async () => {
    const html = await page(['0:{"puuid":"made-up-puuid-value","gameName":"Made Up Name","tagLine":"MADE"}\n']);
    const result = JSON.stringify(riotKeysOnPage(html));
    for (const value of ["made-up-puuid-value", "Made Up Name", "MADE"]) expect(result).not.toContain(value);
    expect(Object.keys(riotKeysOnPage(html).keys)).toEqual([...RIOT_KEYS]);
  });
});

describe("the public team page's Riot keys, in scripts Next.js did not write", () => {
  it("counts a script that does not read as Next.js writes it, and still searches its text", () => {
    const html = '<script>self.__next_f.push([1,"0:{\\"riotId\\":1}\\n"]);self.__next_f.push([1,"x"])</script>';
    expect(riotKeysOnPage(html)).toEqual({ keys: { puuid: 0, gameName: 0, tagLine: 0, riotId: 1 }, total: 1, chunks: 0, unreadable: 1 });
    // A page without the payload at all reads as no chunks, which the live check reports as a failure.
    expect(riotKeysOnPage("<html><body>Team</body></html>")).toMatchObject({ total: 0, chunks: 0, unreadable: 0 });
  });
});

/** A pool champion and a card as the public page carries them with Riot data off (server/public/team.ts), and with it on. */
const OFF = '1:["$","div",null,{"slots":[{"role":"MID","player":{"id":"p-2","rank":null,"season":null,"statsVisible":false,"seasonLabel":""},"champions":[{"championId":"Ahri","games":0,"wins":0,"losses":0,"winRate":null,"kdaRatio":null,"csPerMinute":null,"visionPerGame":null,"masteryPoints":null,"tier":"unknown","tierLabel":"","lastPlayedAt":null}]}]}]\n';
const ON = '1:["$","div",null,{"slots":[{"role":"MID","player":{"id":"p-2","rank":{"tier":"GOLD","division":"II","leaguePoints":46},"season":{"games":12,"winRate":58,"kda":3.1},"statsVisible":true},"champions":[{"championId":"Ahri","games":9,"winRate":55,"kdaRatio":2.5,"csPerMinute":7.1,"masteryPoints":120000,"tier":"strong","lastPlayedAt":"2026-11-20T10:00:00.000Z"}]}]}]\n';

for (const { name, write } of WRITERS) describe(`the public team page's Riot figures, its payload written by Next.js's ${name} writer`, () => {
  const page = async (pieces: readonly Piece[]) => `<!DOCTYPE html><html><body><main>Team</main>${await write(pieces)}</body></html>`;

  it("reads none on a page with Riot data off: statistics hidden, games 0, figures null, tier unknown, no rank", async () => {
    const r = riotFiguresOnPage(await page(['0:{"P":null}\n', OFF]));
    expect(r).toMatchObject({ total: 0, statsVisible: 0, games: 0, tiers: 0, chunks: 2, unreadable: 0 });
    expect(Object.keys(r.figures)).toEqual([...RIOT_FIGURE_KEYS]);
  });

  it("finds every figure of a page with Riot data on, cut anywhere, and counts only", async () => {
    const at = ON.indexOf('"winRate"');
    for (const cut of [at - 1, at + 3, at + 12]) {
      const r = riotFiguresOnPage(await page([ON.slice(0, cut), ON.slice(cut)]));
      expect(r, `cut at ${cut - at}`).toMatchObject({ statsVisible: 1, games: 2, tiers: 2, figures: { winRate: 2, kda: 1, kdaRatio: 1, csPerMinute: 1, masteryPoints: 1, leaguePoints: 1, lastPlayedAt: 1 } });
      expect(JSON.stringify(r)).not.toMatch(/GOLD|Ahri|120000|2026-11-20/);
    }
  });
});
