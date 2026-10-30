/**
 * Reads the song's details from an ID3v2.3 or v2.4 tag: title, artist, album, year,
 * genre, track and the cover picture. Used only to explain an upload (see trace.ts);
 * counting frames never needs it. Anything unexpected is skipped rather than thrown.
 * Reference: id3.org, "ID3 tag version 2.3.0" and "2.4.0 - Structure".
 */

export interface Song {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  genre?: string;
  track?: string;
  /** The front cover if there is one, otherwise the first picture, as a data: URL. */
  cover?: string;
}

/** Which text frame holds which detail. TYER is v2.3's year, TDRC v2.4's. */
const TEXT_FRAMES: Record<string, Exclude<keyof Song, "cover">> = {
  TIT2: "title",
  TPE1: "artist",
  TALB: "album",
  TYER: "year",
  TDRC: "year",
  TCON: "genre",
  TRCK: "track",
};

const FRONT_COVER = 3;

/** `tag` is the whole tag, from "ID3" on. Returns null when it holds no details. */
export function readSong(tag: Uint8Array): Song | null {
  const version = tag[3];
  if (version !== 3 && version !== 4) return null;
  const flags = tag[5] ?? 0;

  // v2.3 can "unsynchronise" the whole tag: a 0x00 is inserted after every 0xFF.
  let body = tag.subarray(10);
  if (version === 3 && flags & 0x80) body = resync(body);

  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let pos = 0;
  if (flags & 0x40) {
    // An extended header. Its size counts itself in v2.4 but not in v2.3.
    pos = version === 4 ? syncsafe(view.getUint32(0)) : view.getUint32(0) + 4;
  }

  const song: Song = {};
  let coverType = -1;

  while (pos + 10 <= body.length) {
    const id = String.fromCharCode(...body.subarray(pos, pos + 4));
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding, or the end of the frames
    const raw = view.getUint32(pos + 4);
    const size = version === 4 ? syncsafe(raw) : raw;
    const frameFlags = view.getUint16(pos + 8);
    let data = body.subarray(pos + 10, pos + 10 + size);
    pos += 10 + size;

    // v2.4 marks unsynchronisation per frame. Compressed or encrypted frames are skipped.
    if (version === 4 && frameFlags & 0x02) data = resync(data);
    const unreadable = version === 4 ? frameFlags & 0x0c : frameFlags & 0xc0;
    if (unreadable || data.length === 0) continue;

    const key = TEXT_FRAMES[id];
    if (key) {
      const text = cleanText(key, decode(data[0] ?? 0, data.subarray(1)));
      if (text) song[key] ??= text;
    } else if (id === "APIC") {
      const picture = readPicture(data);
      if (picture && coverType !== FRONT_COVER) {
        song.cover = picture.url;
        coverType = picture.type;
      }
    }
  }

  return Object.keys(song).length > 0 ? song : null;
}

/** APIC: encoding, MIME type, picture type, description, then the image itself. */
function readPicture(data: Uint8Array): { type: number; url: string } | null {
  const encoding = data[0] ?? 0;
  const mimeEnd = data.indexOf(0, 1);
  if (mimeEnd < 0) return null;
  let mime = latin1(data.subarray(1, mimeEnd)).toLowerCase();
  if (mime === "-->") return null; // a link to a picture elsewhere, not a picture
  if (!mime.includes("/"))
    mime = `image/${mime === "jpg" ? "jpeg" : mime || "jpeg"}`;

  const type = data[mimeEnd + 1] ?? 0;
  const image = data.subarray(textEnd(data, mimeEnd + 2, encoding));
  if (image.length === 0) return null;
  return { type, url: `data:${mime};base64,${base64(image)}` };
}

/** Where the text starting at `from` ends, past its terminator (one or two zero bytes). */
function textEnd(data: Uint8Array, from: number, encoding: number): number {
  if (encoding === 1 || encoding === 2) {
    for (let i = from; i + 1 < data.length; i += 2) {
      if (data[i] === 0 && data[i + 1] === 0) return i + 2;
    }
    return data.length;
  }
  const end = data.indexOf(0, from);
  return end < 0 ? data.length : end + 1;
}

/** Text in one of ID3's four encodings. Several values are separated by a zero. */
function decode(encoding: number, bytes: Uint8Array): string {
  switch (encoding) {
    case 1: {
      // UTF-16 with a byte order mark.
      const bigEndian = bytes[0] === 0xfe && bytes[1] === 0xff;
      const hasBom = bigEndian || (bytes[0] === 0xff && bytes[1] === 0xfe);
      return utf16(hasBom ? bytes.subarray(2) : bytes, bigEndian);
    }
    case 2:
      return utf16(bytes, true);
    case 3:
      return new TextDecoder().decode(bytes);
    default:
      return latin1(bytes);
  }
}

/** Trims terminators, joins multiple values, and drops v2.3's numeric genre codes. */
function cleanText(key: keyof Song, text: string): string {
  const values = text
    .split("\0")
    .map((value) => value.trim())
    .filter(Boolean);
  let joined = values.join(", ");
  // "(17)Rock" means genre 17, named Rock. A bare "(17)" names nothing readable.
  if (key === "genre") joined = joined.replace(/^(\(\d+\))+/, "");
  return joined;
}

function utf16(bytes: Uint8Array, bigEndian: boolean): string {
  let text = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const hi = bytes[i] ?? 0;
    const lo = bytes[i + 1] ?? 0;
    text += String.fromCharCode(bigEndian ? (hi << 8) | lo : (lo << 8) | hi);
  }
  return text;
}

function latin1(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

/** Base64 in slices, since one huge String.fromCharCode call can overflow the stack. */
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Undoes unsynchronisation: every 0xFF 0x00 becomes 0xFF. */
function resync(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    out[n++] = bytes[i] ?? 0;
    if (bytes[i] === 0xff && bytes[i + 1] === 0) i++;
  }
  return out.subarray(0, n);
}

/** ID3's 28-bit sizes: 7 bits per byte, so they never look like a frame sync. */
function syncsafe(raw: number): number {
  return (
    ((raw >>> 24) & 0x7f) * 2 ** 21 +
    ((raw >>> 16) & 0x7f) * 2 ** 14 +
    ((raw >>> 8) & 0x7f) * 2 ** 7 +
    (raw & 0x7f)
  );
}
