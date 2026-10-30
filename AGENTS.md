# AGENTS.md

Instructions for AI coding agents working in this repository. Read [README.md](README.md) for what the project does and [okf/index.md](okf/index.md) for the knowledge behind it.

## What this is

An HTTP API that counts the audio frames in an MP3 (MPEG-1 Layer III) file, with an upload page that explains each step. `POST /file-upload` returns `{"frameCount": n}`. The same `src/app.ts` runs on Node locally and on Cloudflare Workers in production (https://mp3.andrewoakeson.com).

## Commands

Node 20 or newer. Run these before calling a change done:

```bash
npm run check   # Biome lint and format check, then tsc for src/ and web/
npm test        # Vitest, under a second
npm run build   # Builds the page into dist/
```

`npm run fix` applies Biome's lint and format fixes. `npm start` builds and serves on http://localhost:3000.

## Rules

- **No audio libraries.** The MP3 parsing in `src/mp3.ts` is written by hand and imports nothing. That is the point of the project; keep it that way.
- **Stream, don't buffer.** The counter reads one chunk at a time with flat memory. Don't collect the whole upload into memory on the raw-body path.
- **Without `?trace` or `?frames`, the response is exactly `{"frameCount": n}`.** Extra fields go behind a query flag.
- **The sample counts 6089.** That number matches ffprobe and the file's own Xing header. If a change moves it, the change is wrong. See [okf/xing-frame.md](okf/xing-frame.md) for why the Xing/Info frame is not counted.
- **Every error is JSON** with an `error` field. The status codes are listed in the README's API table; keep the table and the code in step.
- **Keep it simple.** Prefer the smallest change that works. Don't add dependencies, layers or options nobody asked for.
- **Match the surrounding code.** Comments explain why, not what. Short, plain sentences in docs.

## Where things are

| Path            | What                                           |
| --------------- | ---------------------------------------------- |
| `src/mp3.ts`    | The frame counter                              |
| `src/app.ts`    | HTTP routes, upload handling, error responses  |
| `src/trace.ts`  | Step-by-step explanation for `?trace`          |
| `src/frames.ts` | Per-frame offsets and sizes for `?frames`      |
| `src/tags.ts`   | ID3v2 song details and cover art               |
| `src/*.test.ts` | Tests                                          |
| `web/`          | The upload page (React, Tailwind, shadcn/ui)   |
| `samples/`      | `sample.mp3` and 20 public domain example MP3s |
| `okf/`          | Project knowledge in Open Knowledge Format     |

## Tests

Tests live next to the code as `src/*.test.ts`. Expected frame counts come from ffprobe, not from this counter:

```bash
ffprobe -v error -select_streams a:0 -count_frames -show_entries stream=nb_read_frames -of default=nw=1:nk=1 <file.mp3>
```

The suite is kept small on purpose. Add a test when you fix a bug or add a status code, not for every helper.

## Git

Branch from `main`, use conventional commit prefixes (`feat:`, `fix:`, `docs:`, `test:`), and open a pull request. CI runs check, build and test on every pull request.
