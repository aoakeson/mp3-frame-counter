import { ArrowUpRightIcon } from "lucide-react";
import type { ReactNode } from "react";
// The real server source, bundled as text, so what the page shows is what runs.
import appSource from "../src/app.ts?raw";
import mp3Source from "../src/mp3.ts?raw";
import type { TraceStep } from "../src/trace";

const SOURCES: Record<TraceStep["code"]["file"], string> = {
  "src/app.ts": appSource,
  "src/mp3.ts": mp3Source,
};
const REPO = "https://github.com/aoakeson/mp3-frame-counter/blob/main/";

/** Shows the function or route that a trace step ran, with the comment above it. */
export function Code({ code }: { code: TraceStep["code"] }) {
  const { first, lines } = extract(SOURCES[code.file], code.start);
  const last = first + lines.length - 1;
  const numbered = lines.map((text, i) => ({ number: first + i, text }));

  return (
    <div className="overflow-hidden rounded-lg border bg-background">
      <a
        href={`${REPO}${code.file}#L${first}-L${last}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between gap-2 border-b px-3 py-1.5 font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        <span>
          {code.file}
          <span className="opacity-60">
            {" "}
            · lines {first}–{last}
          </span>
        </span>
        <ArrowUpRightIcon className="size-3.5" aria-hidden />
        <span className="sr-only">(opens on GitHub)</span>
      </a>
      <pre className="max-h-80 overflow-auto py-2 font-mono text-xs leading-5 [scrollbar-width:thin]">
        {numbered.map(({ number, text }) => (
          <div key={number} className="flex">
            <span className="w-11 shrink-0 select-none pr-4 text-right text-muted-foreground/50">
              {number}
            </span>
            <code className="pr-4 text-foreground">{highlight(text)}</code>
          </div>
        ))}
      </pre>
    </div>
  );
}

/**
 * Finds the line starting with `start`, walks up over the comment directly above it,
 * and down to the closing brace at the start of a line.
 */
function extract(source: string, start: string) {
  const all = source.split("\n");
  const at = all.findIndex((line) => line.startsWith(start));
  if (at < 0) return { first: 1, lines: [`// ${start} not found`] };

  let from = at;
  while (from > 0 && /^\s*(\/\/|\/\*\*|\*)/.test(all[from - 1] ?? "")) from--;
  let to = at;
  while (to < all.length - 1 && !/^\}\)?;?$/.test(all[to] ?? "")) to++;

  return { first: from + 1, lines: all.slice(from, to + 1) };
}

/** Dims comments; everything else is plain text. */
function highlight(line: string): ReactNode {
  if (/^\s*(\/\/|\/\*|\*)/.test(line)) {
    return <span className="text-muted-foreground">{line}</span>;
  }
  const comment = line.indexOf(" // ");
  if (comment < 0) return line || " ";
  return (
    <>
      {line.slice(0, comment)}
      <span className="text-muted-foreground">{line.slice(comment)}</span>
    </>
  );
}
