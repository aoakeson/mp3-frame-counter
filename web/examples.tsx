import { PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIBRARY, type Track } from "./library";
import type { Player } from "./player";

/** The example MP3s. Click one to count its frames, or press play to listen. */
export function Examples(props: {
  busy: boolean;
  player: Player;
  onAnalyze: (track: Track) => void;
}) {
  const { player } = props;
  const playing = player.playing ? player.track?.slug : undefined;

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
              onClick={() => player.toggle(track)}
            >
              {playing === track.slug ? <PauseIcon /> : <PlayIcon />}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function duration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
