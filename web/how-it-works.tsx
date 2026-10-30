import { AudioLinesIcon } from "lucide-react";
import { type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  BigPicture,
  COLORS,
  CountFrames,
  FileLayout,
  FrameIsSound,
  Illustration,
  ReadHeader,
  Reply,
  SkipJunk,
  SkipNotes,
  SkipTag,
  Upload,
} from "./illustrations";
import "./index.css";

/** The How it works page: one idea per section, each with its picture. */
function HowItWorks() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-14 px-4 py-12 sm:py-20">
      <header className="flex flex-col gap-3">
        <nav className="flex items-center justify-between gap-4 text-sm font-medium text-muted-foreground">
          <a href="/" className="flex items-center gap-2 hover:text-foreground">
            <AudioLinesIcon className="size-4" aria-hidden />
            MP3 Frame Counter
          </a>
          <a href="/" className="hover:text-foreground">
            Try it →
          </a>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          How it works
        </h1>
        <p className="text-pretty text-muted-foreground">
          What the counter does with your MP3, one idea at a time. No audio
          knowledge needed.
        </p>
      </header>

      <Section n={1} title="The big picture" picture={<BigPicture />}>
        You give it an MP3. The server reads the file from start to end, counts
        its audio frames, and answers with one number.
      </Section>

      <Section n={2} title="An MP3 is a row of bytes" picture={<FileLayout />}>
        A file is a long row of bytes, small numbers from 0 to 255. In an MP3,
        almost all of that row is <b>frames</b>, packed one after another. A few
        extras can sit around them: a tag at the start, a notes frame, and
        sometimes a tag at the end. The triangle is the <b>reader</b>, the code
        that walks along the file.
        <Legend />
      </Section>

      <Section
        n={3}
        title="A frame is a slice of sound"
        picture={<FrameIsSound />}
      >
        Each frame holds 1,152 <b>samples</b> of sound, about 26 milliseconds at
        the usual 44.1 kHz. Play them in order and you hear the song. The sample
        file has 6,089 frames, which is 2 minutes 39 seconds.
      </Section>

      <Section
        n={4}
        title="Every frame starts with a header"
        picture={<ReadHeader />}
      >
        The first 4 bytes of a frame are its <b>header</b>. It starts with 11
        bits all set to 1, the <b>sync</b>, which means "a frame starts here".
        The rest says what kind of audio follows. The two that matter most are
        the <b>bitrate</b> and the <b>sample rate</b>, because together they
        give the frame's length.
      </Section>

      <Section
        n={5}
        title="Jump from header to header"
        picture={<CountFrames />}
      >
        Knowing the length, the reader jumps exactly that far and lands on the
        next header. It counts one frame per jump and never has to look at the
        sound itself. With <b>variable bitrate</b> (VBR) each frame can have its
        own bitrate, so frames differ in size. That needs nothing special,
        because every header gives its own length.
      </Section>

      <Section n={6} title="Skip the ID3 tag" picture={<SkipTag />}>
        Most MP3s start with an <b>ID3 tag</b>: title, artist, album art. Its
        first 10 bytes say how big it is, so the reader jumps over all of it at
        once. Reading through it instead could mistake bytes in the cover art
        for a frame.
      </Section>

      <Section
        n={7}
        title="Don't count the notes frame"
        picture={<SkipNotes />}
      >
        The first frame of many MP3s is a real frame with no sound in it, called
        a <b>Xing</b> or <b>Info</b> frame. The encoder uses it for notes,
        including how many audio frames follow. It isn't counted, which matches
        the encoder's own number and what ffmpeg reports: 6,089 for the sample.
      </Section>

      <Section
        n={8}
        title="Find the way back after junk"
        picture={<SkipJunk />}
      >
        Sometimes there are bytes that aren't frames: damage, padding, or a tag
        at the end. The reader moves forward one byte at a time until it finds a
        header again. Random bytes can look like a header by chance, so after
        losing its place the reader only trusts a header when another one sits
        exactly where that frame ends.
      </Section>

      <Section n={9} title="Read it as it arrives" picture={<Upload />}>
        The file is never loaded all at once. It arrives in chunks, and each
        chunk is read as it comes in, then let go. This is called{" "}
        <b>streaming</b>, and it means a huge file uses no more memory than a
        small one.
      </Section>

      <Section n={10} title="Send back the answer" picture={<Reply />}>
        When the last byte is read, the server replies with{" "}
        <code className="font-mono text-sm">{'{"frameCount": 6089}'}</code>. If
        it found no frames at all, it says the file isn't an MP3 instead of
        answering 0.
      </Section>

      <Glossary />

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-6 text-sm text-muted-foreground">
        <a href="/" className="font-medium text-foreground hover:underline">
          Try it with your own MP3 →
        </a>
        <a
          href="https://github.com/aoakeson/mp3-frame-counter"
          className="text-xs hover:text-foreground"
        >
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}

function Section(props: {
  n: number;
  title: string;
  picture: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-baseline gap-3 text-xl font-semibold tracking-tight">
        <span className="text-sm text-muted-foreground tabular-nums">
          {props.n}
        </span>
        {props.title}
      </h2>
      <Illustration>{props.picture}</Illustration>
      <div className="leading-relaxed text-pretty text-muted-foreground [&_b]:font-medium [&_b]:text-foreground">
        {props.children}
      </div>
    </section>
  );
}

/** What each color in the pictures means. */
function Legend() {
  const items = [
    [COLORS.tag.bg, "ID3 tag"],
    [COLORS.header.bg, "frame header"],
    [COLORS.audio.bg, "sound"],
    [COLORS.notes.bg, "notes frame"],
    [COLORS.junk.bg, "not a frame"],
  ];
  return (
    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
      <li className="flex items-center gap-2">
        <span className="text-foreground" aria-hidden>
          ▼
        </span>
        the reader
      </li>
      {items.map(([color, name]) => (
        <li key={name} className="flex items-center gap-2">
          <span className={`size-3 rounded-sm ${color}`} aria-hidden />
          {name}
        </li>
      ))}
    </ul>
  );
}

const TERMS = [
  ["Byte", "The smallest piece of a file: a number from 0 to 255."],
  [
    "Frame",
    "A short slice of sound with a header in front. MP3s are mostly frames.",
  ],
  ["Sample", "One measurement of the sound wave. A frame holds 1,152 of them."],
  ["Header", "The 4 bytes at the start of a frame that describe it."],
  [
    "Sync",
    "The 11 bits set to 1 at the start of every header, marking where a frame begins.",
  ],
  [
    "Bitrate",
    "How much data each second of sound uses, in kilobits per second (kbps). Higher means bigger frames.",
  ],
  ["Sample rate", "How many samples per second, usually 44,100 (44.1 kHz)."],
  [
    "Padding",
    "One extra byte some frames add, so the average bitrate comes out exact.",
  ],
  [
    "Frame length",
    "144 × bitrate ÷ sample rate, plus 1 with padding. How far to jump to the next frame.",
  ],
  [
    "VBR",
    "Variable bitrate: each frame picks its own bitrate, so frames differ in size.",
  ],
  [
    "ID3 tag",
    "The song's label (title, artist, cover art), stored before the frames.",
  ],
  [
    "Xing / Info frame",
    "A first frame that holds the encoder's notes instead of sound. Not counted.",
  ],
  ["Resync", "Finding the next real header after bytes that aren't frames."],
  [
    "Streaming",
    "Reading the file in chunks as it arrives, instead of all at once.",
  ],
  [
    "MPEG-1 Layer III",
    "The exact name of the format most people call MP3. The only one this counts.",
  ],
];

function Glossary() {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight">Glossary</h2>
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
        {TERMS.map(([term, meaning]) => (
          <div key={term} className="contents">
            <dt className="font-medium">{term}</dt>
            <dd className="-mt-2 text-muted-foreground sm:mt-0">{meaning}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <HowItWorks />
    </StrictMode>,
  );
}
