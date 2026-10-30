import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countFrames } from "./mp3";

const sample = readFileSync("samples/sample.mp3");
const library = (name: string) => readFileSync(`samples/library/${name}.mp3`);

/** Streams `bytes` in chunks of `size`, as an upload might arrive. */
function streamOf(bytes: Uint8Array, size = 64 * 1024) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) {
        controller.enqueue(bytes.subarray(i, i + size));
      }
      controller.close();
    },
  });
}

const count = (bytes: Uint8Array, size?: number) =>
  countFrames(streamOf(bytes, size));

describe("countFrames", () => {
  // Expected counts are ffprobe's decoded frame counts (nb_read_frames).
  it.each([
    ["sample.mp3 (VBR, ID3v2, Xing)", sample, 6089],
    ["the-entertainer (128 kbps CBR)", library("the-entertainer"), 11726],
    [
      "brian-borus-march (320 kbps CBR, ID3v1)",
      library("brian-borus-march"),
      5622,
    ],
  ])("counts %s", async (_, bytes, expected) => {
    expect(await count(bytes)).toBe(expected);
  });

  it("gives the same count however the upload is chunked", async () => {
    expect(await count(sample, 101)).toBe(6089);
    // Tiny chunks split every header across reads. A slice keeps them fast.
    const head = sample.subarray(0, 20_000);
    const whole = await count(head, head.length);
    expect(whole).toBeGreaterThan(0);
    for (const size of [1, 3]) {
      expect(await count(head, size)).toBe(whole);
    }
  });

  it("ignores junk before and after the audio", async () => {
    const junk = new Uint8Array(5000).fill(0xff); // sync-byte flood
    expect(await count(Buffer.concat([junk, sample, junk]))).toBe(6089);
  });

  it("counts 0 for a file that is not an MP3", async () => {
    expect(await count(readFileSync("package.json"))).toBe(0);
  });

  it("counts 0 for MPEG-2, which is not supported", async () => {
    expect(await count(library("apollo-11-eagle-has-landed"))).toBe(0);
  });

  it("counts 0 for an empty stream", async () => {
    expect(await count(new Uint8Array(0))).toBe(0);
  });
});
