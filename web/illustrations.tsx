/**
 * Small looping pictures of what the counter does, one per step, plus a few more for
 * the How it works page. They all use the same picture language: the file is a row
 * of colored blocks, and a triangle (the reader) moves along it.
 *
 * The animation is SVG's own <animate> tags, so there is no animation library. Each
 * picture's resting state is its final moment, which is all that people who prefer
 * reduced motion see.
 */
import type { ReactNode } from "react";
import type { Picture } from "../src/trace";

const LOOP = "5s";
const MOTION = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One color per kind of block. The How it works legend uses the `bg` half. */
export const COLORS = {
  tag: {
    fill: "fill-amber-300 dark:fill-amber-400/80",
    bg: "bg-amber-300 dark:bg-amber-400/80",
  },
  header: { fill: "fill-sky-500", bg: "bg-sky-500" },
  audio: {
    fill: "fill-sky-200 dark:fill-sky-800",
    bg: "bg-sky-200 dark:bg-sky-800",
  },
  notes: {
    fill: "fill-violet-300 dark:fill-violet-400/70",
    bg: "bg-violet-300 dark:bg-violet-400/70",
  },
  junk: {
    fill: "fill-zinc-300 dark:fill-zinc-600",
    bg: "bg-zinc-300 dark:bg-zinc-600",
  },
};

/** The picture for one step of the upload page's trace, drawn with that file's numbers. */
export function StepIllustration({ picture: p }: { picture: Picture }) {
  return <Illustration>{draw(p)}</Illustration>;
}

function draw(p: Picture): ReactNode {
  switch (p.kind) {
    case "upload":
      return <Upload bytes={p.bytes} />;
    case "id3":
      return <SkipTag bytes={p.bytes} found={p.found} />;
    case "skip":
      return <SkipJunk bytes={p.bytes} />;
    case "header":
      return (
        <ReadHeader
          bitrateKbps={p.bitrateKbps}
          sampleRate={p.sampleRate}
          padding={p.padding}
          frameLength={p.frameLength}
        />
      );
    case "metadata":
      return <SkipNotes tag={p.tag} declaredFrames={p.declaredFrames} />;
    case "frames":
      return <CountFrames count={p.count} sizes={p.sizes} />;
    case "result":
      return <Reply frameCount={p.frameCount} />;
  }
}

export function Illustration({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-4">{children}</div>
  );
}

// ---- The pictures ----
// Each takes the real numbers from a trace. The defaults, shown on the How it works
// page, are the sample file's, except EXAMPLE_SIZES.

/** Made-up variable-bitrate frame sizes. The sample's first frames are all 104 bytes. */
const EXAMPLE_SIZES = [522, 365, 626, 313, 418];

/** The file travels to the server in chunks. Also used for "streaming". */
export function Upload({ bytes }: { bytes?: number }) {
  return (
    <Scene
      label="The file travels from your browser to the server in small chunks, one after another."
      height={92}
    >
      <Devices />
      <Wire />
      <text x={160} y={30} {...small}>
        {bytes === undefined
          ? "chunk by chunk"
          : `${num(bytes)} bytes, chunk by chunk`}
      </text>
      {[0, 1, 2].map((i) => {
        const start = 0.08 + i * 0.22;
        const end = start + 0.34;
        return (
          <g key={i} transform={`translate(${110 + i * 40} 40)`}>
            <Move
              to={[
                [80, 40],
                [80, 40],
                [232, 40],
                [232, 40],
              ]}
              times={[0, start, end, 1]}
            />
            <Animate
              attr="opacity"
              values={[0, 0, 1, 1, 0, 0]}
              times={[0, start - 0.02, start, end, end + 0.02, 1]}
            />
            <rect
              width={12}
              height={12}
              rx={2}
              className={COLORS.header.fill}
            />
          </g>
        );
      })}
    </Scene>
  );
}

/** The reader reads the ID3 tag's size and jumps over the whole tag. */
export function SkipTag({
  bytes = 44,
  found = ["title", "artist", "cover art"],
}: {
  bytes?: number;
  /** The song details the tag holds. */
  found?: string[];
}) {
  // Three fit on the block; the rest are summed up.
  const listed =
    found.length > 3
      ? [...found.slice(0, 2), `${found.length - 2} more`]
      : found;
  const y = 46;
  return (
    <Scene
      label="The file starts with an ID3 tag. Its size is written at its start, so the reader jumps over all of it in one go."
      height={86}
    >
      <rect
        x={10}
        y={y}
        width={119}
        height={26}
        rx={2}
        className={COLORS.tag.fill}
      />
      <text x={70} y={y + 11} {...onBlock} fontWeight={600}>
        ID3 tag · {num(bytes)} bytes
      </text>
      <text x={70} y={y + 20} {...onBlock} fontSize={6.5}>
        {listed.length > 0 ? listed.join(" · ") : "no song details"}
      </text>
      <Frame x={130} y={y} w={80} h={26} />
      <Frame x={210} y={y} w={100} h={26} />
      <text x={134} y={y + 37} {...small} textAnchor="start">
        first frame
      </text>

      <path
        d="M15 36 Q75 0 135 36"
        fill="none"
        strokeDasharray="3 3"
        className="stroke-muted-foreground"
      >
        <Appear at={0.25} />
      </path>
      <text x={75} y={12} {...small} className="fill-foreground">
        <Appear at={0.25} />
        jump {num(bytes)} bytes
      </text>

      <g transform={`translate(134 ${y - 3})`}>
        {MOTION && (
          <animateMotion
            path="M-120 0 Q-60 -36 0 0"
            keyPoints="0;0;1;1"
            keyTimes="0;0.3;0.55;1"
            calcMode="linear"
            dur={LOOP}
            repeatCount="indefinite"
          />
        )}
        <Reader />
      </g>
    </Scene>
  );
}

/** The 4 header bytes come apart into fields, and the fields give the frame's length. */
export function ReadHeader({
  bitrateKbps = 64,
  sampleRate = 44100,
  padding = 0,
  frameLength = 208,
}: {
  bitrateKbps?: number;
  sampleRate?: number;
  padding?: number;
  frameLength?: number;
}) {
  const fields = [
    ["sync", "✓"],
    ["version", "MPEG-1"],
    ["layer", "III"],
    ["bitrate", `${bitrateKbps} kbps`],
    ["sample rate", `${sampleRate / 1000} kHz`],
    ["padding", String(padding)],
  ];
  return (
    <Scene
      label="The frame header is 4 bytes. They split into fields: sync, version, layer, bitrate, sample rate and padding. Bitrate and sample rate give the frame's length."
      height={120}
    >
      <text x={10} y={9} {...small} textAnchor="start">
        header: 4 bytes
      </text>
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={10 + i * 19}
          y={13}
          width={18}
          height={22}
          rx={1.5}
          className={COLORS.header.fill}
        />
      ))}
      <rect
        x={87}
        y={13}
        width={223}
        height={22}
        rx={1.5}
        className={COLORS.audio.fill}
      />
      <text
        x={198}
        y={27}
        {...onBlock}
        className="fill-sky-950 dark:fill-sky-100"
      >
        the rest of the frame: sound
      </text>

      <polygon points="10,37 86,37 314,50 6,50" className="fill-sky-500/10">
        <Appear at={0.08} />
      </polygon>
      {fields.map(([name, value], i) => (
        <g key={name}>
          <Appear at={0.14 + i * 0.07} />
          <rect
            x={6 + i * 52}
            y={50}
            width={48}
            height={32}
            rx={3}
            className="fill-card stroke-border"
          />
          <text x={30 + i * 52} y={62} {...small}>
            {name}
          </text>
          <text
            x={30 + i * 52}
            y={75}
            {...small}
            fontSize={8.5}
            fontWeight={600}
            className="fill-foreground"
          >
            {value}
          </text>
        </g>
      ))}

      <g>
        <Appear at={0.62} />
        <text
          x={160}
          y={101}
          {...small}
          fontSize={8}
          className="fill-foreground font-mono"
        >
          {`144 × ${bitrateKbps * 1000} ÷ ${sampleRate} + ${padding} = ${frameLength} bytes`}
        </text>
        <text x={160} y={114} {...small}>
          so the next frame starts {frameLength} bytes later
        </text>
      </g>
    </Scene>
  );
}

/** The first frame holds the encoder's notes, not sound, so it is not counted. */
export function SkipNotes({
  tag = "Xing / Info",
  declaredFrames = 6089,
}: {
  tag?: string;
  declaredFrames?: number | null;
}) {
  const y = 54;
  return (
    <Scene
      label="The first frame is a Xing or Info frame. It holds the encoder's notes, such as how many audio frames follow, instead of sound, so it is not counted."
      height={96}
    >
      <Counter counts={[0, 1]} times={[0, 0.76]} />
      <Frame x={10} y={y} w={110} h={24} body={COLORS.notes.fill} />
      <Frame x={120} y={y} w={90} h={24} />
      <Frame x={210} y={y} w={100} h={24} />
      <text x={65} y={y + 34} {...small}>
        {tag} frame
      </text>

      <g>
        <Appear at={0.1} />
        <rect
          x={18}
          y={6}
          width={140}
          height={32}
          rx={5}
          className="fill-card stroke-border"
        />
        <line x1={60} y1={38} x2={60} y2={y} className="stroke-border" />
        <text x={26} y={19} {...small} textAnchor="start">
          the encoder's notes:
        </text>
        <text
          x={26}
          y={31}
          {...small}
          textAnchor="start"
          fontSize={8}
          className="fill-foreground"
        >
          {declaredFrames === null
            ? "no frame count given"
            : `"${num(declaredFrames)} audio frames follow"`}
        </text>
      </g>

      <g transform={`rotate(-8 66 ${y + 12})`}>
        <Appear at={0.38} />
        <rect
          x={27}
          y={y + 4}
          width={78}
          height={16}
          rx={3}
          className="fill-card/80 stroke-destructive"
          strokeWidth={1.5}
        />
        <text
          x={66}
          y={y + 15}
          {...small}
          fontSize={8}
          fontWeight={700}
          className="fill-destructive"
        >
          NOT COUNTED
        </text>
      </g>

      <g transform={`translate(124 ${y - 3})`}>
        <Move
          to={[
            [14, y - 3],
            [14, y - 3],
            [124, y - 3],
            [124, y - 3],
          ]}
          times={[0, 0.6, 0.74, 1]}
        />
        <Reader />
      </g>
    </Scene>
  );
}

/** The reader steps through junk one byte at a time until two headers line up. */
export function SkipJunk({ bytes }: { bytes?: number }) {
  const y = 44;
  const junk = [0, 1, 2, 3, 4, 5, 6].map((i) => 10 + i * 16);
  const stops = [...junk.map((x) => x + 7), 126];
  return (
    <Scene
      label="Some bytes are not frames. The reader steps over them one byte at a time until it finds a header, and trusts it only when another header sits exactly where that frame ends."
      height={88}
    >
      {junk.map((x) => (
        <g key={x}>
          <rect
            x={x}
            y={y}
            width={14}
            height={24}
            rx={1.5}
            className={COLORS.junk.fill}
          />
          <text x={x + 7} y={y + 16} {...small} fontSize={9}>
            ?
          </text>
        </g>
      ))}
      <text x={65} y={y + 36} {...small}>
        {bytes === undefined
          ? "junk: not a frame"
          : `${num(bytes)} bytes of junk`}
      </text>
      <Frame x={122} y={y} w={90} h={24} />
      <Frame x={212} y={y} w={98} h={24} />

      <g>
        <Appear at={0.58} />
        <path
          d="M126 38 Q171 4 216 38"
          fill="none"
          strokeDasharray="3 3"
          className="stroke-muted-foreground"
        />
        <text x={171} y={12} {...small} className="fill-foreground">
          ✓ another header right where this frame ends
        </text>
      </g>

      <g transform={`translate(126 ${y - 3})`}>
        <Move
          discrete
          to={stops.map((x) => [x, y - 3])}
          times={stops.map((_, i) => i * 0.07)}
        />
        <Reader />
      </g>
    </Scene>
  );
}

/** The reader hops from header to header, and the count goes up with each hop. */
export function CountFrames({
  count = 6089,
  sizes = EXAMPLE_SIZES,
}: {
  count?: number;
  /** Byte lengths of the first few frames, drawn to scale across 300 units. */
  sizes?: number[];
}) {
  const y = 50;
  const total = sizes.reduce((a, b) => a + b, 0);
  const widths = sizes.map((size) => (size / total) * 300);
  // One count per hop, then the file's real total once the last hop has landed.
  const counts = [0, ...sizes.map((_, i) => i + 1)];
  const times = [0, ...sizes.map((_, i) => i * 0.16 + 0.02)];
  if (count > sizes.length) {
    counts.push(count);
    times.push(0.86);
  }
  const xs = widths.map(
    (_, i) => 10 + widths.slice(0, i).reduce((a, b) => a + b, 0),
  );
  const step = 0.16;
  const path = hops(
    xs.map((x) => x + 4),
    y - 3,
    step,
  );
  return (
    <Scene
      label="The reader hops from one frame header to the next. Each header says how long its frame is, so the reader knows exactly where to land. Frames can be different sizes."
      height={96}
    >
      <text x={10} y={12} {...small} textAnchor="start">
        {sizes.length === 1 ? "first frame" : `first ${sizes.length} frames`},
        size in bytes
      </text>
      <Counter counts={counts} times={times} />
      {xs.map((x, i) => (
        <g key={x}>
          <Frame
            x={x}
            y={y}
            w={widths[i] ?? 0}
            h={24}
            litAt={i * step + 0.02}
          />
          <text x={x + (widths[i] ?? 0) / 2} y={y + 36} {...small}>
            {sizes[i]}
          </text>
          {i > 0 && (
            <path
              d={`M${(xs[i - 1] ?? 0) + 4} ${y - 6} Q${((xs[i - 1] ?? 0) + x) / 2 + 4} ${y - 26} ${x + 4} ${y - 6}`}
              fill="none"
              strokeDasharray="2 3"
              className="stroke-muted-foreground/60"
            />
          )}
        </g>
      ))}
      <g transform={`translate(${(xs.at(-1) ?? 0) + 4} ${y - 3})`}>
        <Move to={path.to} times={path.times} />
        <Reader />
      </g>
    </Scene>
  );
}

/** The server answers with the count. */
export function Reply({ frameCount = 6089 }: { frameCount?: number }) {
  return (
    <Scene
      label={`The server sends back the answer as JSON: {"frameCount": ${frameCount}}.`}
      height={92}
    >
      <Devices
        screen={
          <g>
            <Appear at={0.6} />
            <text
              x={43}
              y={46}
              {...small}
              fontSize={14}
              fontWeight={600}
              className="fill-foreground"
            >
              {num(frameCount)}
            </text>
            <text x={43} y={57} {...small}>
              frames
            </text>
          </g>
        }
      />
      <Wire />
      <text x={160} y={28} {...small} className="fill-foreground font-mono">
        {`{"frameCount": ${frameCount}}`}
      </text>
      <g transform="translate(140 38)">
        <Move
          to={[
            [196, 38],
            [196, 38],
            [82, 38],
            [82, 38],
          ]}
          times={[0, 0.15, 0.58, 1]}
        />
        <Animate
          attr="opacity"
          values={[0, 0, 1, 1, 0, 0]}
          times={[0, 0.12, 0.15, 0.58, 0.62, 1]}
        />
        <rect width={44} height={16} rx={8} className={COLORS.header.fill} />
        <text
          x={22}
          y={11}
          {...small}
          fontSize={8}
          fontWeight={600}
          className="fill-white font-mono"
        >
          {frameCount}
        </text>
      </g>
    </Scene>
  );
}

/** MP3 in, count, one number out. */
export function BigPicture() {
  return (
    <Scene
      label="An MP3 file goes in, the frames are counted, and one number comes out."
      height={80}
    >
      <path
        d="M22 14 H50 L62 26 V66 H22 Z M50 14 V26 H62"
        className="fill-card stroke-foreground/60"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <text
        x={42}
        y={50}
        {...small}
        fontSize={9}
        fontWeight={700}
        className="fill-foreground"
      >
        MP3
      </text>
      <Arrow from={72} to={116} />
      <rect
        x={122}
        y={22}
        width={96}
        height={36}
        rx={6}
        className="fill-card stroke-foreground/60"
        strokeWidth={1.5}
      />
      <text
        x={170}
        y={38}
        {...small}
        fontSize={8.5}
        fontWeight={600}
        className="fill-foreground"
      >
        count the frames
      </text>
      <text x={170} y={50} {...small}>
        on the server
      </text>
      <Arrow from={226} to={260} />
      <text
        x={290}
        y={44}
        {...small}
        fontSize={15}
        fontWeight={600}
        className="fill-foreground"
      >
        6,089
      </text>
      <text x={290} y={56} {...small}>
        frames
      </text>
    </Scene>
  );
}

/** What is inside an MP3 file, from the first byte to the last. */
export function FileLayout() {
  const y = 36;
  const widths = [22, 16, 26, 18, 20, 24, 16, 22, 26];
  const xs = widths.map(
    (_, i) => 80 + widths.slice(0, i).reduce((a, b) => a + b, 0),
  );
  const path = hops([12, 52, ...xs.map((x) => x + 2), 274], y - 3, 0.08);
  return (
    <Scene
      label="An MP3 file is a row of bytes: an ID3 tag at the start, a notes frame, thousands of audio frames, and sometimes a tag at the end."
      height={92}
    >
      <text x={10} y={14} {...small} textAnchor="start">
        first byte
      </text>
      <text x={310} y={14} {...small} textAnchor="end">
        last byte
      </text>
      <rect
        x={10}
        y={y}
        width={39}
        height={22}
        rx={1.5}
        className={COLORS.tag.fill}
      />
      <Frame x={50} y={y} w={30} h={22} head={4} body={COLORS.notes.fill} />
      {xs.map((x, i) => (
        <Frame key={x} x={x} y={y} w={widths[i] ?? 0} h={22} head={4} />
      ))}
      <rect
        x={272}
        y={y}
        width={38}
        height={22}
        rx={1.5}
        className={COLORS.junk.fill}
      />

      <path
        d={`M81 ${y + 28} V${y + 32} H269 V${y + 28}`}
        fill="none"
        className="stroke-muted-foreground/60"
      />
      <text x={30} y={y + 40} {...small}>
        ID3 tag
      </text>
      <text x={65} y={y + 50} {...small}>
        notes frame
      </text>
      <text x={175} y={y + 44} {...small}>
        audio frames (thousands of them)
      </text>
      <text x={291} y={y + 40} {...small}>
        end tag
      </text>

      <g transform={`translate(274 ${y - 3})`}>
        <Move to={path.to} times={path.times} />
        <Reader />
      </g>
    </Scene>
  );
}

/** A frame is a short slice of the sound wave. */
export function FrameIsSound() {
  const slots = [0, 1, 2, 3, 4, 5].map((i) => 10 + i * 50);
  return (
    <Scene
      label="The sound wave is cut into short slices. Each slice is one frame: 1,152 samples, about 26 milliseconds."
      height={104}
    >
      <path
        d={wave()}
        fill="none"
        strokeWidth={1.5}
        className="stroke-sky-500"
      />
      {slots.slice(1).map((x) => (
        <line
          key={x}
          x1={x}
          y1={6}
          x2={x}
          y2={54}
          strokeDasharray="2 3"
          className="stroke-muted-foreground/50"
        />
      ))}
      {slots.map((x) => (
        <Frame key={x} x={x} y={62} w={50} h={18} />
      ))}
      <g transform="translate(60 0)">
        <Move
          discrete
          to={slots.map((x) => [x, 0])}
          times={slots.map((_, i) => i / 6)}
        />
        <rect
          x={0.5}
          y={3}
          width={49}
          height={80}
          rx={4}
          strokeWidth={1.5}
          className="fill-sky-500/10 stroke-foreground/70"
        />
      </g>
      <text x={160} y={98} {...small} className="fill-foreground">
        1 frame = 1,152 samples ≈ 26 milliseconds of sound
      </text>
    </Scene>
  );
}

// ---- Building blocks ----

/** Shared text settings: small, centered, muted. Spread first, then override. */
const small = {
  fontSize: 8,
  textAnchor: "middle",
  className: "fill-muted-foreground",
} as const;

/** Text drawn on a light colored block, so it stays dark in both themes. */
const onBlock = {
  fontSize: 7.5,
  textAnchor: "middle",
  className: "fill-zinc-900",
} as const;

function Scene(props: { label: string; height: number; children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 320 ${props.height}`}
      role="img"
      aria-label={props.label}
      className="mx-auto block w-full max-w-xl font-sans select-none"
    >
      {props.children}
    </svg>
  );
}

/** The triangle that marks where the parser is reading. Its tip is at (0, 0). */
function Reader() {
  return <path d="M-5 -9 L5 -9 L0 0 Z" className="fill-foreground" />;
}

/** A frame: a blue header, then its body (sound, unless said otherwise). */
function Frame(props: {
  x: number;
  y: number;
  w: number;
  h: number;
  head?: number;
  body?: string;
  /** When in the loop the frame lights up as counted. */
  litAt?: number;
}) {
  const head = props.head ?? 8;
  return (
    <g>
      <rect
        x={props.x}
        y={props.y}
        width={head}
        height={props.h}
        rx={1.5}
        className={COLORS.header.fill}
      />
      <rect
        x={props.x + head}
        y={props.y}
        width={props.w - head - 1}
        height={props.h}
        rx={1.5}
        className={props.body ?? COLORS.audio.fill}
      >
        {props.litAt !== undefined && (
          <Animate
            attr="opacity"
            values={[0.35, 0.35, 1, 1]}
            times={[0, props.litAt, props.litAt + 0.03, 1]}
          />
        )}
      </rect>
    </g>
  );
}

/** "frames counted: n" in the top right, stepping through `counts` at `times`. */
function Counter({ counts, times }: { counts: number[]; times: number[] }) {
  return (
    <g>
      <text x={310} y={12} {...small} textAnchor="end">
        frames counted
      </text>
      {counts.map((n, i) => (
        <text
          key={n}
          x={310}
          y={30}
          {...small}
          textAnchor="end"
          fontSize={16}
          fontWeight={600}
          className="fill-foreground tabular-nums"
          opacity={i === counts.length - 1 ? 1 : 0}
        >
          <Animate
            attr="opacity"
            discrete
            values={counts.map((_, j) => (j === i ? 1 : 0))}
            times={times}
          />
          {num(n)}
        </text>
      ))}
    </g>
  );
}

/** A laptop on the left, a server on the right. */
function Devices({ screen }: { screen?: ReactNode }) {
  return (
    <g>
      <rect
        x={10}
        y={22}
        width={66}
        height={44}
        rx={4}
        strokeWidth={1.5}
        className="fill-card stroke-foreground/60"
      />
      <path
        d="M4 70 H82"
        strokeWidth={2}
        strokeLinecap="round"
        className="stroke-foreground/60"
      />
      {screen ?? (
        <text
          x={43}
          y={47}
          {...small}
          fontSize={8}
          className="fill-foreground font-mono"
        >
          song.mp3
        </text>
      )}
      <text x={43} y={84} {...small}>
        your browser
      </text>
      <rect
        x={244}
        y={18}
        width={66}
        height={52}
        rx={4}
        strokeWidth={1.5}
        className="fill-card stroke-foreground/60"
      />
      {[30, 44, 58].map((y) => (
        <g key={y}>
          <line
            x1={254}
            y1={y}
            x2={290}
            y2={y}
            strokeWidth={1.5}
            className="stroke-border"
          />
          <circle cx={298} cy={y} r={2} className="fill-emerald-500" />
        </g>
      ))}
      <text x={277} y={84} {...small}>
        server
      </text>
    </g>
  );
}

/** The dashed line between the browser and the server. */
function Wire() {
  return (
    <line
      x1={80}
      y1={46}
      x2={240}
      y2={46}
      strokeDasharray="3 3"
      className="stroke-border"
    />
  );
}

/** A dashed arrow whose dashes flow forward. */
function Arrow({ from, to }: { from: number; to: number }) {
  return (
    <g className="stroke-muted-foreground" strokeWidth={1.5} fill="none">
      <line x1={from} y1={40} x2={to - 2} y2={40} strokeDasharray="4 4">
        <Animate
          attr="stroke-dashoffset"
          values={[8, 0]}
          times={[0, 1]}
          dur="0.6s"
        />
      </line>
      <path d={`M${to - 6} 35 L${to} 40 L${to - 6} 45`} />
    </g>
  );
}

// ---- Animation ----

/** Animates one attribute through `values` at `times` (0 to 1 through the loop). */
function Animate(props: {
  attr: string;
  values: (number | string)[];
  times: number[];
  discrete?: boolean;
  dur?: string;
}) {
  if (!MOTION) return null;
  return (
    <animate
      attributeName={props.attr}
      values={props.values.join(";")}
      keyTimes={props.times.join(";")}
      calcMode={props.discrete ? "discrete" : "linear"}
      dur={props.dur ?? LOOP}
      repeatCount="indefinite"
    />
  );
}

/** Fades the parent in at `at` and out just before the loop restarts. */
function Appear({ at }: { at: number }) {
  return (
    <Animate
      attr="opacity"
      values={[0, 0, 1, 1, 0]}
      times={[0, at, at + 0.04, 0.95, 1]}
    />
  );
}

/**
 * Moves the parent <g> through absolute positions. The <g>'s own transform is where
 * it rests when nothing animates, so make that the last position.
 */
function Move(props: { to: number[][]; times: number[]; discrete?: boolean }) {
  if (!MOTION) return null;
  return (
    <animateTransform
      attributeName="transform"
      type="translate"
      values={props.to.map((p) => p.join(" ")).join(";")}
      keyTimes={props.times.join(";")}
      calcMode={props.discrete ? "discrete" : "linear"}
      dur={LOOP}
      repeatCount="indefinite"
    />
  );
}

/** Positions for a reader that lands on each x in turn, `step` apart, pausing on each. */
function hops(xs: number[], y: number, step: number) {
  const to: number[][] = [];
  const times: number[] = [];
  xs.forEach((x, i) => {
    to.push([x, y], [x, y]);
    times.push(round(i * step), round(i * step + step / 2));
  });
  to.push([xs.at(-1) ?? 0, y]);
  times.push(1);
  return { to, times };
}

function num(n: number): string {
  return n.toLocaleString("en-US");
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** A made-up sound wave across the picture, as an SVG path. */
function wave(): string {
  const points: string[] = [];
  for (let x = 10; x <= 310; x += 2) {
    const y =
      30 +
      16 *
        (0.6 * Math.sin(x / 9) + 0.4 * Math.sin(x / 3.1)) *
        (0.6 + 0.4 * Math.sin(x / 40));
    points.push(`${x} ${y.toFixed(1)}`);
  }
  return `M${points.join(" L")}`;
}
