/**
 * Turns the counter's events into a short, readable list of steps, for
 * `POST /file-upload?trace`. Each step names the code that did the work, so the
 * upload page can show it. Nothing here affects the count itself.
 */
import type { FrameEvent, FrameHeader } from "./mp3";

export interface TraceStep {
  kind: "upload" | "id3" | "header" | "metadata" | "skip" | "frames" | "result";
  title: string;
  detail: string;
  /** Where the code is: a file, and the text that starts the function or route. */
  code: { file: "src/app.ts" | "src/mp3.ts"; start: string };
  error?: boolean;
  /** The real numbers behind the upload page's animation of this step. */
  picture?: Picture;
}

/** One per step kind. The page draws each step from these, so it shows this file. */
export type Picture =
  | { kind: "upload"; bytes: number }
  | { kind: "id3"; bytes: number }
  | { kind: "skip"; bytes: number }
  | {
      kind: "header";
      bitrateKbps: number;
      sampleRate: number;
      padding: number;
      frameLength: number;
    }
  | { kind: "metadata"; tag: string; declaredFrames: number | null }
  /** `sizes` holds the byte lengths of the first few audio frames. */
  | { kind: "frames"; count: number; sizes: number[] }
  | { kind: "result"; frameCount: number };

const MP3 = "src/mp3.ts";
const APP = "src/app.ts";

export class Trace {
  private bytes = 0;
  private id3?: { length: number; version: number };
  private first?: { offset: number; header: FrameHeader };
  private metadata?: { tag: string; declaredFrames: number | null };
  private frames = 0;
  private sizes: number[] = [];
  private minKbps = Number.POSITIVE_INFINITY;
  private maxKbps = 0;
  private skipped = 0;
  private skipRegions = 0;
  private firstSkip = -1;
  private lastSkip = -2;

  /** Pass this to countFrames. An arrow function, so it can be handed over as-is. */
  readonly record = (event: FrameEvent): void => {
    switch (event.type) {
      case "id3":
        this.id3 = event;
        break;
      case "metadata":
        this.metadata = event;
        this.first ??= event;
        break;
      case "frame":
        this.first ??= event;
        this.frames++;
        if (this.sizes.length < 5) this.sizes.push(event.header.frameLength);
        this.minKbps = Math.min(this.minKbps, event.header.bitrateKbps);
        this.maxKbps = Math.max(this.maxKbps, event.header.bitrateKbps);
        break;
      case "skip":
        // Consecutive skipped bytes are one region of junk.
        if (event.offset !== this.lastSkip + 1) this.skipRegions++;
        if (this.firstSkip < 0) this.firstSkip = event.offset;
        this.lastSkip = event.offset;
        this.skipped++;
        break;
      case "end":
        this.bytes = event.bytes;
        break;
    }
  };

  steps(via: "raw" | "multipart", status: number, ms: number): TraceStep[] {
    const steps: TraceStep[] = [
      {
        kind: "upload",
        title: `Received ${formatBytes(this.bytes)}`,
        detail:
          via === "raw"
            ? "Read straight from the request body, one chunk at a time."
            : "Read from the 'file' field of a multipart form.",
        code: { file: APP, start: "async function uploadStream(" },
        picture: { kind: "upload", bytes: this.bytes },
      },
    ];

    if (this.id3) {
      steps.push({
        kind: "id3",
        title: `Skipped an ID3v2.${this.id3.version} tag`,
        detail: `${count(this.id3.length, "byte")} of metadata at the start, jumped over by its declared size.`,
        code: { file: MP3, start: "function id3v2TagLength(" },
        picture: { kind: "id3", bytes: this.id3.length },
      });
    }

    const skip: TraceStep | undefined =
      this.skipped > 0
        ? {
            kind: "skip",
            title: `Skipped ${count(this.skipped, "byte")} that were not frames`,
            detail: `${count(this.skipRegions, "region")}, the first at byte ${this.firstSkip.toLocaleString("en-US")}. Each byte is passed over until two frame headers line up again.`,
            code: { file: MP3, start: "export async function countFrames(" },
            picture: { kind: "skip", bytes: this.skipped },
          }
        : undefined;
    // Junk before the first frame is reported before it, otherwise after.
    const junkFirst = this.firstSkip < (this.first?.offset ?? Infinity);
    if (skip && junkFirst) steps.push(skip);

    if (this.first) {
      const h = this.first.header;
      steps.push({
        kind: "header",
        title: `Read the first frame header at byte ${this.first.offset.toLocaleString("en-US")}`,
        detail: `MPEG-1 Layer III, ${h.bitrateKbps} kbps, ${h.sampleRate / 1000} kHz, ${h.mono ? "mono" : "stereo"}. That makes the frame ${h.frameLength} bytes long.`,
        code: { file: MP3, start: "function parseFrameHeader(" },
        picture: {
          kind: "header",
          bitrateKbps: h.bitrateKbps,
          sampleRate: h.sampleRate,
          // The header has a padding bit; it is whatever the length adds beyond the formula.
          padding:
            h.frameLength -
            Math.floor((144_000 * h.bitrateKbps) / h.sampleRate),
          frameLength: h.frameLength,
        },
      });
    }

    if (this.metadata) {
      const declared = this.metadata.declaredFrames;
      steps.push({
        kind: "metadata",
        title: `Skipped the ${this.metadata.tag} frame`,
        detail:
          declared === null
            ? "It holds encoder metadata, not audio, so it is not counted."
            : `It holds encoder metadata, not audio, so it is not counted. It says ${count(declared, "audio frame")} follow.`,
        code: { file: MP3, start: "function readMetadataTag(" },
        picture: {
          kind: "metadata",
          tag: this.metadata.tag,
          declaredFrames: declared,
        },
      });
    }

    if (skip && !junkFirst) steps.push(skip);

    steps.push(
      this.frames > 0 && this.first
        ? {
            kind: "frames",
            title: `Counted ${count(this.frames, "audio frame")}`,
            detail: `${this.bitrate()}, ${this.duration(this.first.header.sampleRate)} of audio. Each frame header gives the length to jump to the next.`,
            code: { file: MP3, start: "export async function countFrames(" },
            picture: { kind: "frames", count: this.frames, sizes: this.sizes },
          }
        : {
            kind: "frames",
            title: "Found no MPEG-1 Layer III frames",
            detail: "Only standard .mp3 files are supported.",
            code: { file: MP3, start: "export async function countFrames(" },
            error: true,
          },
      {
        kind: "result",
        title: `Responded ${status}`,
        detail: `In ${ms < 1 ? "under 1" : Math.round(ms)} ms on the server.`,
        code: { file: APP, start: 'app.post("/file-upload"' },
        error: status >= 400,
        picture:
          status === 200
            ? { kind: "result", frameCount: this.frames }
            : undefined,
      },
    );

    return steps;
  }

  private bitrate(): string {
    return this.minKbps === this.maxKbps
      ? `Constant ${this.minKbps} kbps`
      : `Variable bitrate, ${this.minKbps} to ${this.maxKbps} kbps`;
  }

  /** Every MPEG-1 Layer III frame is 1152 samples. */
  private duration(sampleRate: number): string {
    const seconds = Math.round((this.frames * 1152) / sampleRate);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
}

function count(n: number, noun: string): string {
  return `${n.toLocaleString("en-US")} ${noun}${n === 1 ? "" : "s"}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return count(bytes, "byte");
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
