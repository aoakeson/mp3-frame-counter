# Plan: animated step illustrations and a "How it works" page

**Status:** built on 2026-10-30, in `web/illustrations.tsx` and `web/how-it-works.tsx`. Where the build departed from this plan:

- **Junk is plain gray blocks marked "?"**, not hatched.
- **The animation is SVG's own `<animate>` tags**, not CSS keyframes, so `index.css` is unchanged. Under reduced motion they are left out and each picture rests on its final moment.
- **Three pictures exist only on the page:** the big picture, the file layout and "a frame is a slice of sound". The page also gained a tenth section, "Send back the answer".

Two additions to the web page. No server or parser changes, and no new dependencies.

## The shared picture language

Everything is drawn the same way, so once you've seen one illustration you can read the rest:

- **The file is a row of blocks** (bytes), read from left to right.
- **A small arrow, "the reader",** moves along that row. It is the parser.
- **Colors mean one thing each:** amber = ID3 tag, blue = frame header, light blue = audio, purple = Xing/Info frame, gray hatching = junk.
- **A counter** in the corner shows the frame count going up.

The illustrations are SVG animated with CSS: one small loop of 3 to 4 seconds each. With "reduce motion" turned on, the last frame shows as a still picture.

## A. One illustration per step on the upload page

When you open a step, its illustration plays above the explanation and the code. There is one for each of the 7 step kinds the server already returns:

| Step                   | What the animation shows                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Received (upload)      | The file travels from a laptop to the server in small chunks, one after another, never all at once.                                                 |
| Skipped ID3 tag        | An amber block labeled "title, artist, cover art · size 44 bytes". The reader reads the size, then leaps over the whole block in one jump.          |
| Read the first header  | 4 blue bytes come apart into labeled pieces: sync, version, layer, bitrate, sample rate, padding. Then the frame-length sum appears.                |
| Skipped the Xing frame | The first frame flips open to show "notes from the encoder: 6089 frames follow". It gets a "not audio, not counted" stamp, and the counter stays 0. |
| Skipped junk bytes     | The reader shuffles one block at a time through gray junk, then gets a ✓ when two headers line up where expected.                                   |
| Counted frames         | The reader hops from header to header. Frames are different widths (variable bitrate), and the counter ticks 1, 2, 3 and on.                        |
| Responded              | A reply bubble `{"frameCount": 6089}` goes back from the server to the laptop.                                                                      |

The illustrations are the same for every file, not drawn from your file's data. The step's text already gives the real numbers.

## B. A "How it works" page at `/how-it-works`

A single scrolling page in plain language. Each section has a heading, two or three sentences and one of the same illustrations:

1. **The big picture:** MP3 goes in, the server counts, a number comes out.
2. **What an MP3 file is:** a long row of bytes. Most of it is frames, with a few extras.
3. **What a frame is:** about 26 ms of sound (1152 samples). The sample file has 6089 of them, which is 2:39.
4. **The frame header:** the 4 bytes at the start of every frame, and what each part means.
5. **Bitrate, sample rate and frame length:** how the header tells the reader how far to jump, and why variable-bitrate frames come in different sizes.
6. **The ID3 tag:** the song's label (title, cover art), skipped in one jump.
7. **The Xing/Info frame:** a real frame that holds notes from the encoder instead of sound, so it isn't counted.
8. **Junk and resync:** how the reader finds its way again, and why it waits for two headers to line up.
9. **Streaming:** the file is read in chunks, so a 1 GB file uses no more memory than a small one.
10. **Glossary:** a table with one line per term (byte, frame, header, sync, bitrate, sample rate, padding, VBR, ID3, Xing/Info, stream).

The two pages link to each other: "How it works" goes in the upload page's header, and "Try it" goes at the top and bottom of the new page.

## Files

| File                                                        | Change                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `web/illustrations.tsx` (new)                               | The SVG illustrations, one component each, plus `StepIllustration` that picks one by step kind |
| `web/index.css`                                             | The keyframes, and the still version for reduced motion                                        |
| `web/app.tsx`                                               | Show `StepIllustration` inside each opened step. Add the "How it works" link                   |
| `web/how-it-works/index.html`, `web/how-it-works.tsx` (new) | The new page                                                                                   |
| `vite.config.ts`                                            | Build both pages                                                                               |
| `README.md`                                                 | Link to the page                                                                               |

`/how-it-works` resolves to `dist/how-it-works/index.html` both locally (Hono's `serveStatic`) and on Cloudflare (static assets), so routing needs no new code. I'll confirm this on both.

## Delivery

One PR. Before opening it, I'll check both pages in the browser in light mode, dark mode and at phone width, and with reduced motion on. I'll deploy only when you say so.
