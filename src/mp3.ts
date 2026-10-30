/**
 * Counts the audio frames in an MPEG-1 Layer III (MP3) stream.
 *
 * An MP3 file is a run of frames. Each frame starts with a 4-byte header that
 * says how long the frame is, so counting is: read a header, jump over the
 * frame, repeat. Around the frames there may be:
 *   - an ID3v2 tag at the start (title, cover art...), skipped by its declared size;
 *   - a Xing/Info/VBRI frame first: a valid frame holding encoder metadata, not audio,
 *     so it is not counted (ffmpeg and the encoder's own frame count agree);
 *   - junk, corrupt data or trailing tags (ID3v1, APE), passed over a byte at a time
 *     until two headers line up again.
 *
 * Only MPEG-1 Layer III is supported, which is the assessment's scope. Free-format
 * bitrate is not. Reference: ISO/IEC 11172-3, section 2.4.
 */

const ID3_HEADER_SIZE = 10;
const FRAME_HEADER_SIZE = 4;
// A Xing/Info/VBRI tag starts at most 36 bytes into the first frame.
const FIRST_FRAME_PEEK = 40;

// MPEG-1 Layer III lookup tables. 0 marks values that are invalid or unsupported.
const BITRATE_KBPS = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
] as const;
const SAMPLE_RATE_HZ = [44100, 48000, 32000, 0] as const;

export interface FrameHeader {
  /** Bytes, header included. */
  readonly frameLength: number;
  readonly bitrateKbps: number;
  readonly sampleRate: number;
  readonly mono: boolean;
  /** Bytes between the header and the audio data: 17 for mono, 32 otherwise. */
  readonly sideInfoLength: 17 | 32;
}

/** What the counter did, reported to an optional observer. Offsets are bytes from the start. */
export type FrameEvent =
  | { type: "id3"; offset: number; length: number; version: number }
  | {
      type: "metadata";
      offset: number;
      header: FrameHeader;
      tag: "Xing" | "Info" | "VBRI";
      declaredFrames: number | null;
    }
  | { type: "frame"; offset: number; header: FrameHeader }
  | { type: "skip"; offset: number }
  | { type: "end"; bytes: number };

/**
 * Streams the input once and returns the number of audio frames.
 * Memory stays at one chunk plus at most one carried-over frame, whatever the file size.
 * `onEvent` is optional and only used to explain the result (see trace.ts).
 */
export async function countFrames(
  stream: ReadableStream<Uint8Array>,
  onEvent?: (event: FrameEvent) => void,
): Promise<number> {
  let buffer: Uint8Array = new Uint8Array(0); // bytes not yet consumed
  let consumed = 0; // bytes before buffer[0], so events can report absolute offsets
  let skip = 0; // bytes still to jump over: the rest of a frame or of the ID3 tag
  let count = 0;
  let checkedId3 = false;
  let checkedFirstFrame = false;
  let synced = false; // true while each frame has ended exactly where the next began

  // Consumes as much of `buffer` as possible. `final` means no more input is coming,
  // so a short remainder is processed as-is instead of waiting for the next chunk.
  function drain(final: boolean): void {
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    let pos = 0;

    while (true) {
      if (skip > 0) {
        const n = Math.min(skip, buffer.length - pos);
        pos += n;
        skip -= n;
        if (skip > 0) break; // the frame continues in the next chunk
      }

      const remaining = buffer.length - pos;

      if (!checkedId3) {
        if (remaining < ID3_HEADER_SIZE && !final) break;
        checkedId3 = true;
        skip = id3v2TagLength(view, pos);
        if (skip > 0) {
          const version = view.getUint8(pos + 3);
          onEvent?.({
            type: "id3",
            offset: consumed + pos,
            length: skip,
            version,
          });
        }
        continue;
      }

      if (remaining < FRAME_HEADER_SIZE) break;

      let header = parseFrameHeader(view.getUint32(pos));

      // Four bytes can look like a header by chance, in junk or corrupt data. After
      // losing sync, only trust a header that is followed by another header, or by
      // the end of the input, exactly where its frame ends.
      if (header !== null && !synced) {
        const next = pos + header.frameLength;
        if (next + FRAME_HEADER_SIZE <= buffer.length) {
          if (parseFrameHeader(view.getUint32(next)) === null) header = null;
        } else if (!final) {
          break; // wait for the bytes that hold the next header
        } else if (next !== buffer.length) {
          header = null;
        }
      }

      if (header === null) {
        onEvent?.({ type: "skip", offset: consumed + pos });
        pos++; // not a frame here: resync one byte forward
        synced = false;
        continue;
      }
      synced = true;

      if (!checkedFirstFrame) {
        if (remaining < FIRST_FRAME_PEEK && !final) break;
        checkedFirstFrame = true;
        const metadata = readMetadataTag(view, pos, header);
        if (metadata !== null) {
          onEvent?.({
            type: "metadata",
            offset: consumed + pos,
            header,
            ...metadata,
          });
          skip = header.frameLength;
          continue;
        }
      }

      onEvent?.({ type: "frame", offset: consumed + pos, header });
      count++;
      skip = header.frameLength;
    }

    consumed += pos;
    buffer = buffer.subarray(pos);
  }

  for await (const chunk of stream) {
    buffer = buffer.length === 0 ? chunk : concat(buffer, chunk);
    drain(false);
  }
  drain(true);

  onEvent?.({ type: "end", bytes: consumed + buffer.length });
  return count;
}

/**
 * Frame header, 32 bits big-endian:
 *
 *   AAAAAAAA AAABBCCD EEEEFFGH IIJJKLMM
 *
 *   A sync (all ones)    B version      C layer        D CRC protection
 *   E bitrate index      F sample rate  G padding      H private
 *   I channel mode       J mode ext.    K copyright    L original    M emphasis
 *
 * Returns null unless this is a valid MPEG-1 Layer III header.
 */
function parseFrameHeader(h: number): FrameHeader | null {
  if (h >>> 21 !== 0x7ff) return null; // sync
  if (((h >>> 19) & 0b11) !== 0b11) return null; // MPEG-1
  if (((h >>> 17) & 0b11) !== 0b01) return null; // Layer III

  const bitrateKbps = BITRATE_KBPS[(h >>> 12) & 0b1111] ?? 0;
  const sampleRate = SAMPLE_RATE_HZ[(h >>> 10) & 0b11] ?? 0;
  if (bitrateKbps === 0 || sampleRate === 0) return null;

  const padding = (h >>> 9) & 1;
  const mono = ((h >>> 6) & 0b11) === 0b11;

  // A frame is 1152 samples long, so it holds 1152 × bitrate / sampleRate bits,
  // which is 144 × bitrate / sampleRate bytes. A CRC, when present, is inside that.
  const frameLength =
    Math.floor((144 * bitrateKbps * 1000) / sampleRate) + padding;

  return {
    frameLength,
    bitrateKbps,
    sampleRate,
    mono,
    sideInfoLength: mono ? 17 : 32,
  };
}

/** Length of an ID3v2 tag at `pos`, or 0 if there is none. */
function id3v2TagLength(view: DataView, pos: number): number {
  if (ascii(view, pos, 3) !== "ID3") return 0;
  if (view.byteLength - pos < ID3_HEADER_SIZE) return 0;

  const majorVersion = view.getUint8(pos + 3);
  const flags = view.getUint8(pos + 5);
  // "Syncsafe" size: 7 bits per byte, so the size can never look like a frame sync.
  const raw = view.getUint32(pos + 6);
  const size =
    ((raw >>> 24) & 0x7f) * 2 ** 21 +
    ((raw >>> 16) & 0x7f) * 2 ** 14 +
    ((raw >>> 8) & 0x7f) * 2 ** 7 +
    (raw & 0x7f);
  // Only ID3v2.4 defines the 10-byte footer flag.
  const footer = majorVersion === 4 && (flags & 0x10) !== 0 ? 10 : 0;

  return ID3_HEADER_SIZE + size + footer;
}

/**
 * Detects a Xing, Info or VBRI metadata frame at `pos`, and the number of audio frames
 * it says follow. Xing and Info (LAME) follow the side info; VBRI (Fraunhofer) sits at
 * a fixed 36 bytes.
 */
function readMetadataTag(
  view: DataView,
  pos: number,
  header: FrameHeader,
): { tag: "Xing" | "Info" | "VBRI"; declaredFrames: number | null } | null {
  const xingPos = pos + FRAME_HEADER_SIZE + header.sideInfoLength;
  const xing = ascii(view, xingPos, 4);
  if (xing === "Xing" || xing === "Info") {
    // Flag bit 0 says a 4-byte frame count follows the 4-byte flags.
    const hasCount =
      xingPos + 12 <= view.byteLength &&
      (view.getUint32(xingPos + 4) & 1) === 1;
    return {
      tag: xing,
      declaredFrames: hasCount ? view.getUint32(xingPos + 8) : null,
    };
  }

  const vbriPos = pos + 36;
  if (ascii(view, vbriPos, 4) === "VBRI") {
    const hasCount = vbriPos + 18 <= view.byteLength;
    return {
      tag: "VBRI",
      declaredFrames: hasCount ? view.getUint32(vbriPos + 14) : null,
    };
  }

  return null;
}

/** Reads `length` ASCII characters, or "" when they run past the end. */
function ascii(view: DataView, pos: number, length: number): string {
  if (pos + length > view.byteLength) return "";
  let text = "";
  for (let i = 0; i < length; i++) {
    text += String.fromCharCode(view.getUint8(pos + i));
  }
  return text;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const joined = new Uint8Array(a.length + b.length);
  joined.set(a);
  joined.set(b, a.length);
  return joined;
}
