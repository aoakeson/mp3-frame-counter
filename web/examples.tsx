import { PauseIcon, PlayIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LIBRARY, type Track } from "./library";

/** The example MP3s. Click one to count its frames, or press play to listen. */
export function Examples(props: {
  busy: boolean;
  onAnalyze: (track: Track) => void;
}) {
  // One player for the whole list, so starting a track stops the last one.
  const audio = useRef<HTMLAudioElement>(null);
  const loaded = useRef<string>(undefined);
  const [playing, setPlaying] = useState<string>();

  function toggle(track: Track) {
    const player = audio.current;
    if (!player) return;
    if (playing === track.slug) return player.pause();
    if (loaded.current !== track.slug) {
      player.src = `/library/${track.slug}.mp3`;
      loaded.current = track.slug;
    }
    player.play().catch(() => setPlaying(undefined));
  }

  return (
    <section aria-label="Example MP3s" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Example MP3s
        </h2>
        <p className="text-xs text-muted-foreground/70">
          Click one to count its frames, or press play.{" "}
          <a
            href="https://github.com/aoakeson/mp3-frame-counter/blob/main/samples/library/CREDITS.md"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Public domain
          </a>
          , covers too.
        </p>
      </div>
      <ul className="flex flex-col">
        {LIBRARY.map((track) => (
          <li
            key={track.slug}
            data-playing={playing === track.slug || undefined}
            className="flex items-center gap-1 rounded-lg pr-1.5 transition-colors hover:bg-muted data-playing:bg-muted"
          >
            <button
              type="button"
              disabled={props.busy}
              onClick={() => props.onAnalyze(track)}
              title={`Count the frames in ${track.title}`}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <img
                src={`/library/${track.slug}.jpg`}
                alt=""
                width={44}
                height={44}
                loading="lazy"
                className="size-11 shrink-0 rounded-md object-cover"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {track.title}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {track.by}
                </span>
                <span className="truncate font-mono text-[0.7rem] text-muted-foreground/70">
                  {duration(track.seconds)} · {track.format}
                </span>
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${playing === track.slug ? "Pause" : "Play"} ${track.title}`}
              onClick={() => toggle(track)}
            >
              {playing === track.slug ? <PauseIcon /> : <PlayIcon />}
            </Button>
          </li>
        ))}
      </ul>
      {/* biome-ignore lint/a11y/useMediaCaption: music, nothing to caption */}
      <audio
        ref={audio}
        onPlay={() => setPlaying(loaded.current)}
        onPause={() => setPlaying(undefined)}
      />
    </section>
  );
}

function duration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
