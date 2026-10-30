import { PauseIcon, PlayIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FrameMap } from "../src/frames";
import type { Track } from "./library";

/** Drawn on the frame being heard. The theme is monochrome, so this is its one color. */
const PLAYHEAD = "oklch(0.7 0.19 45)";
/** Width of one frame on the tape, in CSS pixels. */
const CELL = 6;

/** One shared player: starting a track stops the last one. */
export function usePlayer() {
  const audio = useRef<HTMLAudioElement>(null);
  const [track, setTrack] = useState<Track>();
  const [playing, setPlaying] = useState(false);

  function toggle(next: Track) {
    const player = audio.current;
    if (!player) return;
    if (track?.slug === next.slug && !player.paused) return player.pause();
    if (track?.slug !== next.slug) {
      player.src = `/library/${next.slug}.mp3`;
      setTrack(next);
    }
    player.play().catch(() => setPlaying(false));
  }

  function close() {
    audio.current?.pause();
    setTrack(undefined);
  }

  const element = (
    // biome-ignore lint/a11y/useMediaCaption: music, nothing to caption
    <audio
      ref={audio}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
    />
  );
  return { audio, track, playing, toggle, close, element };
}

export type Player = ReturnType<typeof usePlayer>;

/** The bar along the bottom while a track is loaded: what is playing, and its frames. */
export function PlayerBar({ player }: { player: Player }) {
  const { track, playing } = player;
  if (!track) return null;
  return (
    <section
      aria-label="Now playing"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur transition-[translate] duration-300 starting:translate-y-full"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src={`/library/${track.slug}.jpg`}
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-md object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{track.title}</span>
            <span className="truncate text-xs text-muted-foreground">
              {track.by}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={playing ? "Pause" : "Play"}
            onClick={() => player.toggle(track)}
          >
            {playing ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close player"
            onClick={player.close}
          >
            <XIcon />
          </Button>
        </div>
        <FrameTape key={track.slug} track={track} player={player} />
      </div>
    </section>
  );
}

type Loaded = FrameMap & { ms: number };

/**
 * Every frame of the song as a bar on a moving tape. Each frame is the same
 * 1152 samples of sound, so the bars are equally wide; their height is how many
 * bytes the encoder spent on that frame. The server finds the frames (it never
 * decodes audio), and the playback clock says which one is being heard.
 */
function FrameTape({ track, player }: { track: Track; player: Player }) {
  const [map, setMap] = useState<Loaded | "loading" | "failed">("loading");
  const [current, setCurrent] = useState(0);
  const tape = useRef<HTMLCanvasElement>(null);
  const overview = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    loadFrames(track.slug).then(
      (loaded) => live && setMap(loaded),
      () => live && setMap("failed"),
    );
    return () => {
      live = false;
    };
  }, [track.slug]);

  useEffect(() => {
    if (typeof map === "string") return;
    const frameSeconds = map.samplesPerFrame / map.sampleRate;
    const largest = map.sizes.reduce((a, b) => Math.max(a, b), 0);
    let raf = 0;
    let shown = -1;

    function draw() {
      const audio = player.audio.current;
      if (typeof map === "string" || !audio || !tape.current) return;
      const n = map.sizes.length;
      const at = audio.currentTime / frameSeconds; // in frames, fractional
      const index = Math.min(n - 1, Math.floor(at));
      if (index !== shown) {
        shown = index;
        setCurrent(index);
      }

      const colors = getComputedStyle(tape.current);
      const ink = colors.color;

      // The tape: frames scroll right to left under a fixed playhead in the middle.
      const t = sizeCanvas(tape.current);
      const mid = t.w / 2;
      const from = Math.max(0, Math.floor(at - mid / CELL) - 1);
      const to = Math.min(n - 1, Math.ceil(at + mid / CELL) + 1);
      for (let i = from; i <= to; i++) {
        const x = mid + (i - at) * CELL;
        const h = Math.max(2, ((map.sizes[i] ?? 0) / largest) * t.h);
        t.ctx.fillStyle = i === index ? PLAYHEAD : ink;
        t.ctx.globalAlpha = i === index ? 1 : i < index ? 0.55 : 0.2;
        t.ctx.fillRect(x, t.h - h, CELL - 1, h);
      }
      t.ctx.globalAlpha = 1;
      t.ctx.fillStyle = PLAYHEAD;
      t.ctx.fillRect(mid, 0, 1, t.h);

      // The whole song, squeezed to the width: the loudest-to-encode frame per pixel.
      if (overview.current) {
        const o = sizeCanvas(overview.current);
        const played = (index / n) * o.w;
        for (let px = 0; px < o.w; px++) {
          let max = 0;
          const end = Math.floor(((px + 1) / o.w) * n);
          for (let i = Math.floor((px / o.w) * n); i < end; i++) {
            max = Math.max(max, map.sizes[i] ?? 0);
          }
          const h = Math.max(1, (max / largest) * o.h);
          o.ctx.fillStyle = ink;
          o.ctx.globalAlpha = px < played ? 0.55 : 0.2;
          o.ctx.fillRect(px, o.h - h, 1, h);
        }
        o.ctx.globalAlpha = 1;
        o.ctx.fillStyle = PLAYHEAD;
        o.ctx.fillRect(played, 0, 2, o.h);
      }

      raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [map, player.audio]);

  if (map === "loading") {
    return (
      <p className="h-28 text-xs text-muted-foreground">
        Asking the server where the frames are…
      </p>
    );
  }
  if (map === "failed") {
    return (
      <p className="text-xs text-muted-foreground">
        The server found no MPEG-1 Layer III frames to draw. This file plays,
        but it is a format the counter does not read.
      </p>
    );
  }

  const n = map.sizes.length;
  const frameMs = (map.samplesPerFrame / map.sampleRate) * 1000;
  const realTime = (n * frameMs) / map.ms;
  // Constant bitrate frames differ by at most the one padding byte.
  const smallest = map.sizes.reduce((a, b) => Math.min(a, b), Infinity);
  const largest = map.sizes.reduce((a, b) => Math.max(a, b), 0);
  const constant = largest - smallest <= 1;

  function seek(event: React.MouseEvent<HTMLCanvasElement>) {
    const audio = player.audio.current;
    if (!audio || typeof map === "string") return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    audio.currentTime = (fraction * n * frameMs) / 1000;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <canvas ref={tape} className="h-16 w-full text-foreground" />
      <canvas
        ref={overview}
        onClick={seek}
        title="Seek"
        className="h-4 w-full cursor-pointer text-foreground"
      />
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 font-mono text-[0.7rem] text-muted-foreground tabular-nums">
        <span>
          <span className="text-foreground">
            frame {(current + 1).toLocaleString()}
          </span>{" "}
          of {n.toLocaleString()} · byte{" "}
          {(map.offsets[current] ?? 0).toLocaleString()} · {map.sizes[current]}{" "}
          bytes · {map.bitratesKbps[current]} kbps
        </span>
        <span>
          server mapped every frame in {Math.round(map.ms)} ms,{" "}
          {Math.round(realTime).toLocaleString()}× faster than playing them
        </span>
      </div>
      <p className="text-xs text-muted-foreground/80">
        Each bar is one frame: 1,152 samples, {frameMs.toFixed(1)} ms of sound.
        Its height is the bytes the encoder spent on it.{" "}
        {constant
          ? "This file is constant bitrate, so every frame costs the same, give or take a padding byte."
          : `This file is variable bitrate: frames cost ${smallest} to ${largest} bytes, more where the sound is harder to encode.`}
      </p>
    </div>
  );
}

/** Asks the server for the frame map once per track, with the time it took. */
const requests = new Map<string, Promise<Loaded>>();
function loadFrames(slug: string): Promise<Loaded> {
  let request = requests.get(slug);
  if (!request) {
    request = (async () => {
      const file = await (await fetch(`/library/${slug}.mp3`)).blob();
      const started = performance.now();
      const res = await fetch("/file-upload?frames", {
        method: "POST",
        body: file,
      });
      const body: { frames?: FrameMap } = await res.json();
      if (!res.ok || !body.frames) throw new Error("No frames");
      return { ...body.frames, ms: performance.now() - started };
    })();
    request.catch(() => requests.delete(slug));
    requests.set(slug, request);
  }
  return request;
}

/** Sizes a canvas's pixels to its box and clears it. */
function sizeCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
  if (canvas.height !== Math.round(h * dpr))
    canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
