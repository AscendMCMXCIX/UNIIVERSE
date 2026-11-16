import { describe, expect, it } from "vitest";
import { createInlinedDataReadableStream } from "next/dist/server/app-render/use-flight-response";
import { RIOT_KEYS, riotKeysOnPage } from "../../../scripts/riot-keys.mjs";

/*
  The live check's look at the public team page's Riot keys (scripts/riot-keys.mjs): no `puuid`,
  `gameName`, `tagLine` or `riotId` key in the page's HTML or in the RSC payload it carries. The
  pages here are written by Next.js's own writer of that payload (the `self.__next_f.push` scripts),
  cut where its stream may cut them, so a Next.js upgrade that changes the format fails here rather
  than leaving the live check blind. Every value is made up; only counts come back.
*/

const encoder = new TextEncoder();

/** A page as Next.js serves it: some HTML, then the RSC payload in the pieces its stream delivered. */
async function page(pieces: Array<string | Uint8Array>, html = "<!DOCTYPE html><html><body><main>Team</main>", nonce?: string): Promise<string> {
  const flight = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(typeof piece === "string" ? encoder.encode(piece) : piece);
      controller.close();
    },
  });
  const reader = createInlinedDataReadableStream(flight, nonce, null).getReader();
  const decoder = new TextDecoder();
  let out = html;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return `${out}</body></html>`;
}

/** One public card's player as the page's props carry it (server/public/team.ts), with the card's own motto. */
const CARD = '1:["$","div",null,{"slots":[{"role":"TOP","player":{"id":"p-1","name":"Top Shown","avatarUrl":null,"rank":null,"look":{"style":{"identity":{"tagline":"Made-up motto","emblem":null}},"bannerUrl":null},"social":[],"season":null,"statsVisible":false}}]}]\n';

describe("the public team page's Riot keys", () => {
  it("reads a page with none: the public card's fields, the card's own tagline and text about Riot IDs", async () => {
    const html = await page(['0:{"P":null,"b":"build"}\n', CARD], "<!DOCTYPE html><html><body><main><p>Riot IDs and PUUIDs are never shown here.</p></main>", "n0nce");
    expect(riotKeysOnPage(html)).toEqual({ keys: { puuid: 0, gameName: 0, tagLine: 0, riotId: 0 }, total: 0, chunks: 2, unreadable: 0 });
  });

  it("finds a key wherever Next.js cuts the payload, even where no script holds the whole key", async () => {
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

  it("reads the chunks Next.js writes as bytes (not valid UTF-8) with the text around them", async () => {
    const html = await page(['0:{"a":1,"', new Uint8Array([0xff, ...encoder.encode('x":2,"riot')]), 'Id":3}\n']);
    expect(html).toContain("self.__next_f.push([3,");
    expect(riotKeysOnPage(html)).toMatchObject({ keys: { riotId: 1 }, total: 1, chunks: 3, unreadable: 0 });
  });

  it("counts a script that does not read as Next.js writes it, and still searches its text", () => {
    const html = '<script>self.__next_f.push([1,"0:{\\"riotId\\":1}\\n"]);self.__next_f.push([1,"x"])</script>';
    expect(riotKeysOnPage(html)).toEqual({ keys: { puuid: 0, gameName: 0, tagLine: 0, riotId: 1 }, total: 1, chunks: 0, unreadable: 1 });
    // A page without the payload at all reads as no chunks, which the live check reports as a failure.
    expect(riotKeysOnPage("<html><body>Team</body></html>")).toMatchObject({ total: 0, chunks: 0, unreadable: 0 });
  });

  it("returns counts only, never a value from the page", async () => {
    const html = await page(['0:{"puuid":"made-up-puuid-value","gameName":"Made Up Name","tagLine":"MADE"}\n']);
    const result = JSON.stringify(riotKeysOnPage(html));
    for (const value of ["made-up-puuid-value", "Made Up Name", "MADE"]) expect(result).not.toContain(value);
    expect(Object.keys(riotKeysOnPage(html).keys)).toEqual([...RIOT_KEYS]);
  });
});
