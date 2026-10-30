import {
  AudioLinesIcon,
  CircleAlertIcon,
  FileAudioIcon,
  InfoIcon,
  type LucideIcon,
  ScanSearchIcon,
  SendIcon,
  SkipForwardIcon,
  TagIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import type { TraceStep } from "../src/trace";
import { Code } from "./code";
import { StepIllustration } from "./illustrations";

/** The JSON from `POST /file-upload?trace`: a count or an error, plus the steps. */
interface Response {
  frameCount?: number;
  error?: string;
  trace?: TraceStep[];
}

type State =
  | { kind: "idle" }
  | { kind: "counting"; file: File }
  | { kind: "done"; file: File; ok: boolean; body: Response; ms: number }
  | { kind: "failed"; file?: File; message: string };

const ICONS: Record<TraceStep["kind"], LucideIcon> = {
  upload: UploadIcon,
  id3: TagIcon,
  header: ScanSearchIcon,
  metadata: InfoIcon,
  skip: SkipForwardIcon,
  frames: AudioLinesIcon,
  result: SendIcon,
};

export function App() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function count(file: File) {
    setState({ kind: "counting", file });
    const started = performance.now();
    try {
      // `?trace` asks the server to explain each step. The count is the same either way.
      const res = await fetch("/file-upload?trace", {
        method: "POST",
        body: file, // the raw body, the path that streams on the server
      });
      // Cloudflare's own limit errors are HTML, not JSON.
      const body: Response = await res
        .json()
        .catch(() => ({ error: `Unexpected ${res.status} response.` }));
      const ms = performance.now() - started;
      setState({ kind: "done", file, ok: res.ok, body, ms });
    } catch {
      setState({
        kind: "failed",
        file,
        message: "Could not reach the server.",
      });
    }
  }

  async function countSample() {
    try {
      const res = await fetch("/sample.mp3");
      if (!res.ok) throw new Error();
      count(new File([await res.blob()], "sample.mp3", { type: "audio/mpeg" }));
    } catch {
      setState({ kind: "failed", message: "Could not load the sample file." });
    }
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-8 px-4 py-12 sm:py-20">
      <header className="flex flex-col gap-3">
        <nav className="flex items-center justify-between gap-4 text-sm font-medium text-muted-foreground">
          <p className="flex items-center gap-2">
            <AudioLinesIcon className="size-4" aria-hidden />
            MP3 Frame Counter
          </p>
          <a href="/how-it-works/" className="hover:text-foreground">
            How it works →
          </a>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          How many frames are in your MP3?
        </h1>
        <p className="text-pretty text-muted-foreground">
          Upload a file to count its audio frames. Then open any step to see
          what happened and the exact code that ran on the server.
        </p>
      </header>

      <DropZone
        busy={state.kind === "counting"}
        onFile={count}
        onSample={countSample}
      />

      {state.kind !== "idle" && <Result state={state} />}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <code className="font-mono">
          curl -F file=@song.mp3 {window.location.origin}/file-upload
        </code>
        <a
          href="https://github.com/aoakeson/mp3-frame-counter"
          className="hover:text-foreground"
        >
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}

function DropZone(props: {
  busy: boolean;
  onFile: (file: File) => void;
  onSample: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <section
      aria-label="Upload an MP3"
      data-over={over || undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file && !props.busy) props.onFile(file);
      }}
      className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-foreground/25 px-6 py-12 text-center transition-colors data-over:border-foreground/40 data-over:bg-muted/60"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <FileAudioIcon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-medium">Drop an MP3 here</p>
        <p className="text-sm text-muted-foreground">
          It is streamed to the server, counted, and not stored.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          size="lg"
          disabled={props.busy}
          onClick={() => input.current?.click()}
        >
          Choose a file
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={props.busy}
          onClick={props.onSample}
        >
          Try the sample
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".mp3,audio/mpeg"
        aria-label="MP3 file"
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) props.onFile(file);
          e.target.value = ""; // so choosing the same file again still triggers
        }}
      />
    </section>
  );
}

function Result({ state }: { state: Exclude<State, { kind: "idle" }> }) {
  return (
    <Card className="py-6 transition-[opacity,translate] duration-300 starting:translate-y-1 starting:opacity-0">
      <CardContent className="flex flex-col gap-6 px-6">
        <Summary state={state} />
        {state.kind === "counting" && <Pending file={state.file} />}
        {state.kind === "done" && state.body.trace && (
          <section className="flex flex-col gap-3 border-t pt-5">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                What happened
              </h2>
              <p className="text-xs text-muted-foreground/70">
                Open a step to see it happen
              </p>
            </div>
            <Steps steps={state.body.trace} />
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function Summary({ state }: { state: Exclude<State, { kind: "idle" }> }) {
  if (state.kind === "counting") {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <Spinner className="size-5" />
        <span>
          Counting frames in{" "}
          <span className="text-foreground">{state.file.name}</span>
        </span>
      </div>
    );
  }

  if (state.kind === "done" && state.ok && state.body.frameCount) {
    return (
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-5xl font-semibold tracking-tight tabular-nums">
            {state.body.frameCount.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            audio frames in{" "}
            <span className="text-foreground">{state.file.name}</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {Math.round(state.ms)} ms
        </p>
      </div>
    );
  }

  const message =
    state.kind === "failed" ? state.message : (state.body.error ?? "Failed.");
  return (
    <div className="flex items-start gap-3">
      <CircleAlertIcon
        className="mt-0.5 size-5 shrink-0 text-destructive"
        aria-hidden
      />
      <div>
        <p className="font-medium text-destructive">{message}</p>
        {state.file && (
          <p className="text-sm text-muted-foreground">{state.file.name}</p>
        )}
      </div>
    </div>
  );
}

/** Shown while the upload is in flight: the first step runs, the rest wait. */
function Pending({ file }: { file: File }) {
  return (
    <Trace>
      <TraceLine status="running">
        <TraceIcon>
          <UploadIcon />
        </TraceIcon>
        <TraceTitle>Uploading {file.name}</TraceTitle>
        <TraceDescription>
          {(file.size / 1024 / 1024).toFixed(1)} MB
        </TraceDescription>
      </TraceLine>
      <TraceLine status="pending">
        <TraceIcon>
          <AudioLinesIcon />
        </TraceIcon>
        <TraceTitle>Counting frames</TraceTitle>
      </TraceLine>
    </Trace>
  );
}

/** One row per step. Opening a row shows what it did and the code that did it. */
function Steps({ steps }: { steps: TraceStep[] }) {
  return (
    <Trace className="gap-3">
      {steps.map((step) => {
        const Icon = step.error ? CircleAlertIcon : ICONS[step.kind];
        return (
          <TraceCollapsible key={step.kind}>
            <TraceCollapsibleTrigger>
              <TraceLine status={step.error ? "error" : undefined}>
                <TraceIcon>
                  <Icon />
                </TraceIcon>
                <TraceTitle>{step.title}</TraceTitle>
              </TraceLine>
            </TraceCollapsibleTrigger>
            <TraceCollapsibleContent className="flex flex-col gap-3">
              {step.picture && <StepIllustration picture={step.picture} />}
              <p>{step.detail}</p>
              <Code code={step.code} />
            </TraceCollapsibleContent>
          </TraceCollapsible>
        );
      })}
    </Trace>
  );
}
