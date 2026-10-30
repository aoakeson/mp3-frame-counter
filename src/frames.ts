/**
 * Collects where every audio frame is, for `POST /file-upload?frames`. The upload
 * page uses it to draw the frames in time with playback. Nothing here affects the count.
 */
import type { FrameEvent } from "./mp3";

/** Every frame in order, as parallel arrays to keep the JSON small. */
export interface FrameMap {
  /** MPEG-1 Layer III frames are always 1152 samples long. */
  samplesPerFrame: 1152;
  sampleRate: number;
  /** Byte offset of each frame's header. */
  offsets: number[];
  /** Bytes in each frame, header included. */
  sizes: number[];
  bitratesKbps: number[];
  /** Milliseconds the server spent reading and counting the file. */
  ms: number;
}

export class FrameMapper {
  private readonly map: FrameMap = {
    samplesPerFrame: 1152,
    sampleRate: 0,
    offsets: [],
    sizes: [],
    bitratesKbps: [],
    ms: 0,
  };

  /** Pass this to countFrames. An arrow function, so it can be handed over as-is. */
  readonly record = (event: FrameEvent): void => {
    if (event.type !== "frame") return;
    this.map.sampleRate ||= event.header.sampleRate;
    this.map.offsets.push(event.offset);
    this.map.sizes.push(event.header.frameLength);
    this.map.bitratesKbps.push(event.header.bitrateKbps);
  };

  result(ms: number): FrameMap {
    return { ...this.map, ms };
  }
}
