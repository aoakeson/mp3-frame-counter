# MP3 Frame Counter: Build Plan

**Status:** plan only, nothing built. Revision 3, 2026-10-29.
Revision 3 folds in two independent reviews (one for simplicity, one for requirements and facts). What changed is listed in section 15.

One small Hono app in three source files. Locally it runs on plain Node with `npm start`. In
production the same `app.ts` runs on Cloudflare Workers at https://mp3.andrewoakeson.com,
deployed by Cloudflare's own git integration on every merge to `main`. It serves a tiny upload
page and one endpoint, `POST /file-upload`, which streams an MP3 through a hand-written
MPEG-1 Layer III frame counter and answers `{"frameCount": n}`.

---

## 0. What the environment looks like today

| Item | Found | Consequence |
|---|---|---|
| `C:\projects\mp3Analysis` | empty, not a git repo | scaffold from scratch |
| Sample MP3 | **not present** | drop it in as `samples/sample.mp3` before PR 2 |
| Node / npm | 24.19 / 11.17 | fine; `.nvmrc` = `24`, `engines.node >= 20` |
| git, gh | gh logged in as `aoakeson`, scopes `repo` + `workflow` | can create the repo, open and merge PRs from the CLI |
| ffmpeg / ffprobe | present | fixtures and the reference frame count |
| mediainfo | missing | optional; see the version warning in section 11 before trusting it |
| `andrewoakeson.com` | nameservers are Cloudflare | Workers custom domain works directly |
| `mp3.andrewoakeson.com` | no DNS record | created automatically on the first deploy |
| Package majors (npm, today) | hono 4, @hono/node-server 2, tsx 4, typescript 7, @types/node 24, biome 2, vitest 5, wrangler 4 | pins in section 8 are current |
| Toolchain spike (throwaway, in the session scratchpad, not the project) | hello-world Hono app with the exact planned versions and configs: install, `check`, `test`, `start`, static page, multipart, raw body, 405, 404 all verified on Windows with Node 24 and in a Linux `node:20` container | the local-run story is tested on two OSes and both ends of the Node range; details in section 17 |

---

## 1. Goals and non-goals

**Goals**
- Meet the spec exactly: `POST /file-upload`, JSON `{"frameCount": <number>}`, correct headers.
- Correct count for MPEG-1 Layer III, proven three ways (section 11), with the one known ambiguity explained in the README.
- Runs locally on any machine with Node 20+: `npm install`, `npm start`. No accounts, no build step.
- Small, readable TypeScript that one person can explain line by line.
- Streams the upload: constant memory, work proportional to frame count.
- Useful errors with the right status codes, always JSON from our code.
- Deployed at https://mp3.andrewoakeson.com on every merge to `main`, with no secrets in GitHub.
- A tiny no-dependency upload page at `/`.

**Non-goals (deliberately out)**
MPEG-2 / 2.5, Layer I / II, free-format bitrate, auth, rate limiting, persistence, multi-file
uploads, CORS, OpenAPI, Docker, unit tests (the runner is wired, nothing more; see assumption 11).

---

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| HTTP framework | Hono | same code on Node and Workers, ~14 KB, typed, built-in `HTTPException` |
| Local runtime | Node via `@hono/node-server`, started with `tsx` | one command, no Cloudflare account, works on Windows/macOS/Linux with Node 20+ |
| Production runtime | Cloudflare Workers + Static Assets | the deploy target; `wrangler deploy` bundles `src/app.ts` directly |
| Deployment | Cloudflare **Workers Builds** (git integration) | deploys `main` on merge and gives PR preview URLs with zero secrets, tokens or workflow YAML |
| CI | one GitHub Actions job: Biome, `tsc --noEmit`, Vitest | visible quality gate on every PR; nothing else |
| Source layout | three files: `app.ts`, `server.ts`, `mp3.ts` | the parser reads top to bottom in one file; HTTP in one file; Node glue in one file |
| Upload ingress | `multipart/form-data` (field `file`) **and** raw body | `curl -F` and forms are what assessors reach for; raw body is the only path that truly streams and is what the UI uses |
| Multipart size cap | 100 MB, `413` JSON above it | `formData()` buffers the whole body on both runtimes; the cap matches Cloudflare's own body limit so local and prod agree |
| Parser shape | one `countFrames(stream)` function with local state | one caller; a class adds nothing |
| Header validation | strict MPEG-1 Layer III: sync, version, layer, bitrate, sample rate | matches scope; same checks ffmpeg uses; emphasis is not checked (ffmpeg and mediainfo accept the reserved value) |
| Xing / Info / VBRI first frame | detected and **excluded** from the count | it carries no audio; the encoder's own frame-count field, ffprobe and current mediainfo all agree; README explains the plus-one (section 11) |
| Corrupt / unknown bytes | advance one byte and resync | simple, standard |
| Zero frames found | `400` | a clear message beats answering 0 for a PNG |
| Error body | `{"error": "<message>"}` | one shape everywhere |
| Tooling | TypeScript strict, Biome, Vitest, npm | one tool per job |
| Git | four PRs, squash-merged through `gh`, Conventional Commit titles, tag `v1.0.0` | reviewable history, CI on every change |

---

## 3. Architecture

```
Browser / curl
     |
     v
 POST /file-upload --> app.ts   uploadStream(): multipart part or raw body  -->  mp3.ts countFrames(stream)
                                c.json({ frameCount })                            |-- id3v2TagLength()   skip the tag
                                                                                  |-- parseFrameHeader() validate, frame length
                                                                                  \-- isInfoFrame()      Xing/Info/VBRI, not audio
 GET /             --> public/index.html
                       locally:    served by server.ts
                       on Workers: served by Cloudflare's static assets before the Worker runs
```

### Files

```
src/
  app.ts        The HTTP surface: uploadStream() helper, the route, 404/405, error mapping. Default export; Workers runs it as-is.
  server.ts     Local runner: Node http server around app.ts, also serves public/ (Cloudflare does that itself in prod).
  mp3.ts        The parser. Imports nothing. Bytes in, number out. Read it top to bottom.
public/
  index.html    The whole UI. No build step, no CDN.
samples/
  sample.mp3    The assessor's file.
```

### Public signatures

```ts
// mp3.ts
export function countFrames(stream: ReadableStream<Uint8Array>): Promise<number>;
// (parseFrameHeader, id3v2TagLength, isInfoFrame are module-private helpers; exported only if tests need them later)

// app.ts
export default app;   // Hono instance

// server.ts: no exports, starts listening
```

---

## 4. MP3 parsing: exactly what `mp3.ts` does

All multi-byte reads go through `DataView`, never `bytes[i]`, so `noUncheckedIndexedAccess` stays on without `!`.

### 4.1 Frame header

Read 4 bytes big-endian as one `uint32` and bit-twiddle that number.

| Bits | Field | Extract | Rule |
|---|---|---|---|
| 31-21 | frame sync | `h >>> 21 === 0x7FF` | must be all ones |
| 20-19 | version | `(h >>> 19) & 3` | must be `3` (MPEG-1). `0`=2.5, `1`=reserved, `2`=MPEG-2 |
| 18-17 | layer | `(h >>> 17) & 3` | must be `1` (Layer III). `3`=I, `2`=II, `0`=reserved |
| 16 | protection | `(h >>> 16) & 1` | `0` = 16-bit CRC follows; **no effect on frame length** |
| 15-12 | bitrate index | `(h >>> 12) & 0xF` | `1..14` valid; `0` = free format (unsupported), `15` = bad |
| 11-10 | sample rate index | `(h >>> 10) & 3` | `0`=44100 `1`=48000 `2`=32000; `3` = reserved |
| 9 | padding | `(h >>> 9) & 1` | adds 1 byte |
| 7-6 | channel mode | `(h >>> 6) & 3` | `3` = mono, side info 17 bytes; else 32 |
| 8, 5-0 | private, mode ext, copyright, original, emphasis | ignored | ffmpeg and mediainfo do not reject on these either |

Sketch, showing the intended comment density:

```ts
// MPEG-1 Layer III frame header, 32 bits big-endian (ISO/IEC 11172-3, 2.4.1.3):
//   AAAAAAAA AAABBCCD EEEEFFGH IIJJKLMM
//   A sync (all 1s)   B version   C layer   D protection   E bitrate index
//   F sample-rate idx G padding   H private I channel mode J mode ext  K copyright  L original  M emphasis
// Only MPEG-1 Layer III is accepted (assessment scope). Free-format bitrate (index 0) is not supported.

const BITRATE_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0] as const; // 0 = free/bad
const SAMPLE_RATE_HZ = [44100, 48000, 32000, 0] as const;                                           // 0 = reserved

interface FrameHeader {
  readonly frameLength: number;      // bytes, header included
  readonly sideInfoLength: 17 | 32;  // mono = 17, else 32; only needed to locate a Xing/Info tag
}

function parseFrameHeader(h: number): FrameHeader | null {
  if (h >>> 21 !== 0x7ff) return null;        // sync word
  if (((h >>> 19) & 3) !== 3) return null;    // MPEG-1 only
  if (((h >>> 17) & 3) !== 1) return null;    // Layer III only
  const bitrateKbps = BITRATE_KBPS[(h >>> 12) & 0xf] ?? 0;
  const sampleRate = SAMPLE_RATE_HZ[(h >>> 10) & 3] ?? 0;
  if (bitrateKbps === 0 || sampleRate === 0) return null;
  const padding = (h >>> 9) & 1;
  const mono = ((h >>> 6) & 3) === 3;
  // 144 = 1152 samples per frame / 8 bits per byte. The CRC, when present, is inside this length.
  return { frameLength: Math.floor((144 * bitrateKbps * 1000) / sampleRate) + padding, sideInfoLength: mono ? 17 : 32 };
}
```

### 4.2 Frame length

`frameLength = floor(144 * bitrateBps / sampleRate) + padding`, 96 to 1441 bytes for MPEG-1 Layer III.
VBR needs nothing special: every frame's length comes from its own header.

### 4.3 ID3v2 tag (skip by size, never scan)

At offset 0: `"ID3"`, major version, revision, flags, then a 4-byte **syncsafe** size (7 bits per byte).
`tagLength = 10 + size + footer`, where `footer = 10` only when major version is 4 and flag bit `0x10` is
set (the footer flag does not exist in 2.3; honouring it there would skip into the first frame).
Returns 0 for buffers shorter than 10 bytes or without the magic. Embedded cover art routinely
contains `FF FB`-style byte pairs, so scanning through a tag would over-count. Checked at offset 0
only; a second consecutive tag is rare and falls through to resync.

### 4.4 Xing / Info / VBRI frame

The first valid frame of most files is a metadata frame with a valid header but no audio:
- `"Xing"` (VBR) or `"Info"` (CBR, written by LAME) at offset `4 + sideInfoLength` (36 stereo, 21 mono)
- `"VBRI"` (Fraunhofer) at offset 36

Check the first valid frame only, with a bounds check (at end of input fewer than 40 bytes may remain).
If it is one of these, skip it without counting. The frame-count field inside that tag (section 11)
is the encoder's own statement of how many audio frames follow, and it excludes the tag frame.

### 4.5 Streaming algorithm (`countFrames`)

```
locals: buf (unconsumed bytes), skip = 0, count = 0, id3Checked = false, firstFrameChecked = false

for await chunk of stream:  buf = buf.length ? concat(buf, chunk) : chunk    // one copy per chunk, none when buf is empty
                            drain(final = false)
after the loop:             drain(final = true); return count

drain(final):
  loop:
    if skip > 0:            // inside a frame or a tag: jump, never inspect audio bytes
                            n = min(skip, buf.length); buf = buf.subarray(n); skip -= n
                            if buf is empty: return
    if !id3Checked:         if buf.length < 10 and !final: return          // need the 10-byte tag header
                            id3Checked = true
                            skip = id3v2TagLength(buf); if skip > 0: continue
    if buf.length < 4:      return                                         // partial header: wait, or done if final
    header = parseFrameHeader(uint32 at buf[0..3])
    if header is null:      buf = buf.subarray(1); continue                // not a frame: resync one byte forward
    if !firstFrameChecked:  if buf.length < 40 and !final: return          // the tag sits within the first 40 bytes
                            firstFrameChecked = true
                            if isInfoFrame(buf, header): skip = header.frameLength; continue   // metadata, not audio
    count++; skip = header.frameLength
```

Every iteration consumes at least one byte or returns, so it cannot hang. Frames are **jumped over**,
not scanned, so work is O(frames + junk bytes) and memory is one chunk plus a partial header.
A truncated final frame counts if its header was valid (ffmpeg emits it too).

### 4.6 Edge cases and behaviour

| Input | Behaviour |
|---|---|
| ID3v2.2 / 2.3 / 2.4 tag, with or without footer | skipped by declared size |
| ID3 tag with embedded picture | skipped, never scanned |
| Tag size larger than file | zero frames, so `400` |
| Junk bytes before first frame | resync finds the first real header. If the junk happens to contain a false sync, the Info-frame check is spent on it and a following Info frame would be counted; accepted, noted in the README |
| Xing / Info / VBRI first frame | not counted |
| CBR, VBR, ABR | each header gives its own length |
| CRC-protected frames | counted; length formula unchanged |
| Padding bit | +1 byte on that frame |
| Mono (17-byte side info) | tag offset adjusts via `sideInfoLength` |
| Free-format bitrate (index 0) | unsupported; header treated as invalid (documented) |
| MPEG-2 / 2.5 / Layer I / II frames | not counted (out of scope by spec) |
| ID3v1 / APE / Lyrics3 at the end | resync walks through; ASCII cannot form a sync word |
| Truncated final frame | counted (header was valid) |
| Header split across two chunks | carried over; parsed once 4 bytes exist |
| First frame split across chunks | waits for 40 bytes before the tag check |
| Empty body / empty file / non-MP3 | `400` with a specific message |
| Multipart body over 100 MB | `413` JSON, before anything is buffered |
| Client aborts mid-upload | stream read rejects; nothing to answer |

---

## 5. API contract

### `POST /file-upload`

Accepts either:
1. `multipart/form-data` with a file part named `file`, or
2. the MP3 bytes as the raw request body. Any non-multipart `Content-Type` is treated as raw bytes, so a bare `curl --data-binary` works even though curl labels it `x-www-form-urlencoded`.

The declared `Content-Type` and the filename are **not** used to decide whether something is an MP3. The parser is the detector, which is why a non-MP3 gets `400` rather than `415`.

Responses from our code are always JSON with `Content-Type: application/json` (Hono adds no charset, and RFC 8259 defines none):

| Status | Body | When |
|---|---|---|
| `200` | `{"frameCount": 1234}` | at least one frame counted |
| `400` | `{"error":"No file received. Send the MP3 as multipart/form-data with a 'file' field, or as the raw request body."}` | empty body, no `file` part, empty file, unparseable multipart |
| `413` | `{"error":"Multipart uploads are limited to 100 MB. Send larger files as the raw request body."}` | multipart `Content-Length` over the cap |
| `400` | `{"error":"No MPEG-1 Layer III frames found. Only that format (standard .mp3) is supported."}` | parser found nothing |
| `405` | `{"error":"Method not allowed"}` + `Allow: POST` | any other method on `/file-upload` |
| `404` | `{"error":"Not found"}` | unknown path |
| `500` | `{"error":"Internal server error"}` | unexpected; detail goes to the server log only |

Two responses in production are **not** ours and are HTML: Cloudflare's own `413` for bodies over
100 MB, and Cloudflare's "Error 1102" when a request exceeds the plan's CPU limit. Both go in the
README limits section.

### `GET /`
The upload page.

### `app.ts` (close to the whole file)

```ts
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { countFrames } from "./mp3";

// formData() buffers the whole body in memory on Node and on Workers, so multipart gets a cap.
// Raw bodies stream and have none. 100 MB matches Cloudflare's request-body limit, so local and prod agree.
const MAX_MULTIPART_BYTES = 100 * 1024 * 1024;
const NO_FILE = "No file received. Send the MP3 as multipart/form-data with a 'file' field, or as the raw request body.";

// Picks the byte stream out of the request. Multipart: the 'file' part. Anything else: the body as-is,
// so `curl --data-binary @x.mp3` works even though curl labels it application/x-www-form-urlencoded.
async function uploadStream(req: Request): Promise<ReadableStream<Uint8Array>> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    // A request with neither Content-Length nor Transfer-Encoding has no body (RFC 9112). Workers gives
    // body === null for that; Node gives an empty stream, so the headers are checked too.
    const hasBody = req.headers.get("content-length") !== null || req.headers.get("transfer-encoding") !== null;
    if (!req.body || !hasBody || req.headers.get("content-length") === "0") throw new HTTPException(400, { message: NO_FILE });
    return req.body;
  }
  if (Number(req.headers.get("content-length")) > MAX_MULTIPART_BYTES) {
    throw new HTTPException(413, { message: "Multipart uploads are limited to 100 MB. Send larger files as the raw request body." });
  }
  const form = await req.formData().catch(() => null);   // unparseable multipart -> same 400 as "no file"
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) throw new HTTPException(400, { message: NO_FILE });
  return file.stream();
}

const app = new Hono();

app.post("/file-upload", async (c) => {
  const frameCount = await countFrames(await uploadStream(c.req.raw));
  // Zero frames almost always means "not an MP3" (a PNG, a text file). A clear 400 beats answering 0.
  if (frameCount === 0) {
    throw new HTTPException(400, { message: "No MPEG-1 Layer III frames found. Only that format (standard .mp3) is supported." });
  }
  return c.json({ frameCount });   // Content-Type: application/json
});

// Hono does not answer 405 by itself. Registered after .post, so only other methods land here.
app.all("/file-upload", (c) => c.json({ error: "Method not allowed" }, 405, { Allow: "POST" }));
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);              // full detail to the log, never to the client
  return c.json({ error: "Internal server error" }, 500);
});

export default app;                // Cloudflare Workers runs this object directly; server.ts wraps it for Node.
```

### `server.ts` (the whole file)

```ts
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import app from "./app";

// On Cloudflare the static page is served by the platform before the Worker runs.
// Locally, Node has to serve it, so that wiring lives here and not in app.ts.
// Paths are relative to the working directory; npm always runs scripts from the package root.
app.get("/", serveStatic({ root: "./public" }));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, () => console.log(`Listening on http://localhost:${port}`));
```

### Examples (quote the `@path`; unquoted `@` is splatting syntax in PowerShell)

```bash
curl -sS -F "file=@samples/sample.mp3" http://localhost:3000/file-upload
```
```bash
curl -sS --data-binary "@samples/sample.mp3" http://localhost:3000/file-upload
```
On Windows PowerShell write `curl.exe`, because bare `curl` is an alias for `Invoke-WebRequest`.
If port 3000 is taken: `PORT=3001 npm start` (PowerShell: `$env:PORT=3001; npm start`).

---

## 6. UI (`public/index.html`)

One file, about 50 lines, no framework, no CDN, no build.
- A drop zone wrapping a real `<input type="file" accept=".mp3,audio/mpeg">` (keyboard and screen-reader friendly for free).
- Shows the chosen filename and size. "Count frames" button disabled until a file is chosen and while a request is in flight.
- Sends `fetch("/file-upload", { method: "POST", body: file })`: raw body, so the browser path is the streaming path and never hits the multipart cap.
- Result: the HTTP status and the JSON body, as returned. That is the whole display; it doubles as an API demo.
- Network failure handled separately from API errors. `color-scheme: light dark`, fits a phone width, nothing stored.

---

## 7. Comment policy

Comment the *why*, not the *what*.
- `mp3.ts` opens with a short block: what an MP3 frame is, the spec reference, what is deliberately unsupported. The bit layout diagram lives there once.
- One-line comments on every decision a reader could question: skipping ID3 by size, excluding the Info frame, resyncing byte by byte, counting a truncated last frame, treating non-multipart bodies as raw bytes, the multipart cap, returning 400 for zero frames, why `server.ts` serves static files but `app.ts` does not.
- No comments that restate the code.
- "With more time" notes live in the README. At most one `// Future:` comment per file, pointing there.

---

## 8. Project layout and tooling

```
.
|-- .github/workflows/ci.yml   one job: biome, tsc, vitest
|-- public/index.html
|-- samples/sample.mp3
|-- src/app.ts, server.ts, mp3.ts
|-- .gitattributes             * text=auto eol=lf   and   *.mp3 binary
|-- .gitignore                 node_modules/ .wrangler/ *.log
|-- .nvmrc                     24
|-- biome.json
|-- package.json, package-lock.json
|-- README.md
|-- tsconfig.json
\-- wrangler.jsonc
```

`.gitattributes` matters on Windows: Biome formats to LF, and a CRLF checkout would make `npm run check` fail locally while passing in CI.

**package.json**
```jsonc
"type": "module",
"engines": { "node": ">=20" },
"dependencies":    { "hono": "^4", "@hono/node-server": "^2" },
"devDependencies": { "tsx": "^4", "typescript": "^7", "@types/node": "^24", "@biomejs/biome": "^2", "vitest": "^5", "wrangler": "^4" },
"scripts": {
  "start":  "tsx src/server.ts",
  "dev":    "tsx watch src/server.ts",
  "check":  "biome ci . && tsc --noEmit",
  "fix":    "biome check --write .",
  "test":   "vitest run --passWithNoTests",
  "deploy": "wrangler deploy"
}
```
Eight packages; three exist only to run locally or deploy (`@hono/node-server`, `tsx`, `wrangler`).
`wrangler` is the heaviest install and an assessor never needs it; it stays in `devDependencies`
so the deploy tool is lockfile-pinned (assumption 12 has the alternative).
- `@hono/node-server` 2.x needs Node 20+, which is where `engines` sits. Its public API did not change from 1.x.
- TypeScript 7 is the native compiler, used here only for `tsc --noEmit`; tsx, Vitest, Biome and wrangler bring their own parsers. Its `types` option defaults to `[]`, hence the explicit `types: ["node"]`.

**tsconfig.json** (the flags that matter)
`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `noEmit`, `skipLibCheck`,
`target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `lib: ["ES2022"]`, `types: ["node"]`, include `src`.
`@types/node` declares the web globals the app uses (`Request`, `Response`, `ReadableStream`, `FormData`, `File`),
so no Workers type package and no generated types. The app has no bindings and no env.

**biome.json**: recommended rules, 2-space indent, and `vcs: { enabled: true, clientKind: "git", useIgnoreFile: true }` so `.wrangler/` and `node_modules/` are never scanned.

**wrangler.jsonc**
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "mp3-frame-counter",
  "main": "src/app.ts",
  "compatibility_date": "<date of scaffold>",
  "assets": { "directory": "./public" },
  "routes": [{ "pattern": "mp3.andrewoakeson.com", "custom_domain": true }],
  "observability": { "enabled": true }
}
```
Assets are tried first; `/file-upload` matches no asset, so it always reaches the Worker. `GET /` is
answered by the platform with `public/index.html`. `npx wrangler dev` exists for a local workerd run
when checking Workers parity; it is not the everyday local path and has no script.

Not included on purpose: husky/lint-staged (CI is the gate), ESLint + Prettier (Biome does both),
`.editorconfig` (Biome formats), Dependabot, Docker, a `tsc` build step, branch protection rulesets.

---

## 9. GitHub: repo and PR workflow

### One-time setup
1. `git init -b main`; bootstrap commit on `main` with `.gitignore`, `.gitattributes` and a one-line README.
2. `gh repo create mp3-frame-counter --public --source . --remote origin --push` (or `--private` and invite the assessors).

No secrets, no tokens. Deployment is configured once in the Cloudflare dashboard (section 10).

### Every change is a PR
Commits are authored as Andrew (git identity) and carry the standard co-author trailer. PRs are opened
and merged through `gh`, which is signed in as Andrew. Because a single-commit PR squashes to that
commit's message, every commit message is already a Conventional Commit.

```bash
git switch -c feat/mp3-parser
```
```bash
gh pr create --fill --base main
```
```bash
gh pr checks --watch
```
(`gh pr checks` run within a few seconds of `gh pr create` can say "no checks reported"; wait a moment and rerun.)
```bash
gh pr merge --squash --delete-branch
```
```bash
git switch main && git pull
```

### The workflow, `.github/workflows/ci.yml`
```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
permissions: { contents: read }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm run check
      - run: npm test
```
That is the whole file. Majors are current as of today (checkout 7.0, setup-node 7.1).

---

## 10. Cloudflare deployment (Workers Builds)

After PR 1 merges, connect the repository once in the dashboard:
Workers & Pages, Create, Workers, **Import a repository**, authorise the Cloudflare GitHub app for
`mp3-frame-counter`, keep the defaults (build command empty, deploy command `npx wrangler deploy`,
production branch `main`). Cloudflare installs dependencies from the lockfile, runs `wrangler deploy`
with the repo's `wrangler.jsonc`, and on that first deploy creates the `mp3` DNS record and certificate
for the custom domain. From then on:
- every merge to `main` deploys to https://mp3.andrewoakeson.com;
- every PR gets a build check and a preview URL, free.

Fallback, from the laptop, if the dashboard route is ever unavailable:
```bash
npx wrangler login
```
```bash
npm run deploy
```

**Limits to state in the README**

| Limit | Value | Effect |
|---|---|---|
| Request body | 100 MB on Free/Pro (200 MB Business, 500 MB Enterprise) | Cloudflare answers its own HTML 413 above this |
| Worker memory | 128 MB | raw-body path streams; the multipart path is capped at 100 MB by us |
| CPU time | 10 ms per request on Free, 30 s on Paid | over the limit Cloudflare returns its HTML "Error 1102". `formData()` on a large multipart body and the per-frame loop both cost CPU; measure (next paragraph) |
| Wall time | none while the client is connected | slow uploads are fine |

Locally on Node none of these apply.

**Measure before submission:** after the first deploy, upload the sample via multipart and via raw
body and read the CPU time per request in the Worker's observability logs. Then try a ~50 MB file
both ways. If multipart of a normal-sized file is anywhere near 10 ms, switch the account to Workers
Paid ($5/month, one toggle, 30 s CPU) rather than tuning. Write the measured numbers in the README.

**Rollback:** pick a previous version in the dashboard, or `npx wrangler rollback`.

---

## 11. Verification plan (the correctness case, in order)

### The one ambiguity: the Info frame
Nearly every MP3 begins with a Xing (VBR) or Info (CBR) frame: a valid frame header whose payload
is encoder metadata, not audio. Count it or not? Three authorities say **do not**:
1. the encoder itself: the Xing/Info tag carries a `frames` field, and LAME writes the number of audio frames *after* the tag frame;
2. ffprobe: the demuxer consumes the tag frame and seeks past it;
3. mediainfo **26.10 and later** (October 2026): reports the same number for CBR and VBR.

The trap: mediainfo **before 26.10** reports one more for CBR files (it includes the Info frame when
estimating), and the assessment's "correct number" was very likely produced with such a build. So:
- the API returns the audio frame count (N), on principle and with evidence;
- the README states both numbers for the sample ("N; N+1 if the Info header frame is counted; mediainfo older than 26.10 reports N+1 for CBR files"), plus the mediainfo version used;
- assumption 5 is no longer "flip if mediainfo disagrees"; it is "exclude, and explain".

### Three reference numbers for `samples/sample.mp3`
```bash
ffprobe -v error -select_streams a:0 -count_frames -count_packets -show_entries stream=nb_read_frames,nb_read_packets -of default=nw=1 samples/sample.mp3
```
Expect `nb_read_frames` equal to ours. `nb_read_packets` may be one higher if the file has an ID3v1
`TAG` or APE tail (ffmpeg flushes the tail as a packet); check for `TAG` 128 bytes before the end
before calling that a mismatch.

The Xing/Info `frames` field: locate the first frame after the ID3v2 tag, read the tag at offset
36 (stereo) or 21 (mono) of that frame, confirm flag bit 0 at tag+4, read the big-endian uint32 at
tag+8. A throwaway tsx script does this in ten lines; its output goes in the PR 2 description. Expect
it equal to ours.

If mediainfo is installed, note its version first:
```bash
mediainfo --Version
```
```bash
mediainfo --ParseSpeed=1 --Inform="Audio;%FrameCount%" samples/sample.mp3
```

### Fixtures (ffmpeg, Git Bash on Windows; not committed unless tiny)
```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -c:a libmp3lame -b:a 128k cbr-info.mp3
```
```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -c:a libmp3lame -b:a 128k -write_xing 0 cbr-plain.mp3
```
```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -ac 1 -c:a libmp3lame -q:a 4 vbr-mono.mp3
```
```bash
ffmpeg -f lavfi -i "sine=frequency=440:duration=3" -f lavfi -i "color=c=red:s=64x64:d=1" -frames:v 1 -map 0:a -map 1:v -c:a libmp3lame -b:a 128k -c:v png -id3v2_version 3 -metadata title=Test -disposition:v attached_pic tagged.mp3
```
```bash
head -c 100000 cbr-info.mp3 > truncated.mp3
```
Expected: `cbr-info` and `cbr-plain` give the same count (Info frame excluded); `vbr-mono` exercises the 17-byte side info; `tagged` equals `cbr-info` (ID3 skipped); `truncated` must not crash.

### HTTP matrix (local on :3000, then the PR preview URL, then https://mp3.andrewoakeson.com)
| Call | Expect |
|---|---|
| `-F "file=@samples/sample.mp3"` | 200, N, `content-type: application/json` |
| `--data-binary "@samples/sample.mp3" -H "Content-Type: audio/mpeg"` | same |
| `--data-binary "@samples/sample.mp3"` (no header) | same |
| `-X POST` with no body | 400 no file |
| `-F "file=@README.md"` | 400 no frames |
| `-F "nope=hello"` | 400 no file |
| `-F "file=@big.bin"` where `big.bin` is 101 MB (`head -c 105906176 /dev/zero > big.bin`), local only | 413 JSON, immediately, nothing buffered |
| `GET /file-upload` | 405 with `Allow: POST` |
| `GET /nope` | 404 JSON |
| `GET /` | 200 `text/html` |
| Browser: drop the sample, then a PNG | 200 + JSON shown, then 400 + JSON shown |

### Fresh-machine check
Clone into a new folder, `npm install`, `npm start`, run the first curl, compare with the number the
README prints. If that needs anything the README does not say, fix the README. Do it once on
PowerShell and once on Git Bash or WSL.

---

## 12. Build order: four PRs

| PR | Branch | Title | Contents | Done when |
|---|---|---|---|---|
| 1 | `chore/scaffold` | `chore: scaffold hono app, tooling and CI` | package.json, tsconfig, biome.json, wrangler.jsonc, `.nvmrc`, hello-world `app.ts` + `server.ts`, placeholder `public/index.html`, `ci.yml`, README with the run instructions | `npm start` answers, `npm run check` green, CI green. **Then connect Workers Builds**; hello world is live on the domain |
| 2 | `feat/mp3-parser` | `feat: streaming MPEG-1 Layer III frame counter` | `src/mp3.ts`, `samples/sample.mp3`, README sections "how it counts", "verify it yourself", the Info-frame explanation with both numbers | count equals `nb_read_frames` and the Xing `frames` field; fixtures behave; the three numbers pasted in the PR description |
| 3 | `feat/file-upload` | `feat: POST /file-upload returns the frame count` | `uploadStream` and the routes in `app.ts`, README API table and limits | HTTP matrix passes locally and on the preview URL |
| 4 | `feat/ui` | `feat: minimal upload page` | `public/index.html`, one README line | browser check on the preview URL; after merge, the full matrix against production, the CPU measurement, then `git tag v1.0.0 && git push --tags` |

The README grows with each PR; there is no separate docs PR. PR 2 is the one to read slowly.

---

## 13. README outline (first screen first)

1. One sentence on what it is, the live URL, and: `samples/sample.mp3` has **N** frames.
2. Run it locally: Node 20+, `npm install`, `npm start`, open http://localhost:3000. The `-F` curl line, the raw-body curl line, the PowerShell `curl.exe` line, the `PORT` note.
3. API reference (section 5 tables), including the two Cloudflare HTML error cases and the multipart cap.
4. How counting works (five bullets) and the Info-frame paragraph with both numbers and the mediainfo version note.
5. Verify the number yourself: the ffprobe command, the mediainfo command, how to read the Xing field.
6. Limits and decisions: MPEG-1 Layer III only, 400 not 415 for non-MP3, truncated frame counted, Cloudflare caps and the measured CPU numbers.
7. Development: scripts, tooling, the three-file layout.
8. Deployment: one paragraph on Workers Builds, the fallback command.
9. With more time (section 16).

---

## 14. Assumptions made (override any before the build)

| # | Assumption | Alternative |
|---|---|---|
| 1 | Repo is public | private + invite assessors |
| 2 | Workers Free plan, with the CPU measurement in section 10 deciding | Workers Paid from day one ($5/month) |
| 3 | Multipart field must be named `file` | accept the first file part under any name |
| 4 | Zero frames returns `400` | `200` with `{"frameCount":0}` |
| 5 | Info frame excluded, explained in the README with both numbers | include it, matching older mediainfo builds |
| 6 | Biome for lint + format | ESLint + Prettier |
| 7 | Repo and Worker both named `mp3-frame-counter` | `mp3-analysis`, matching the folder |
| 8 | Sample MP3 committed under `samples/` | keep out of git, document where to get it |
| 9 | Local runner is `tsx` | Node 22.18+ runs `.ts` natively, but needs `.ts` import extensions and a higher Node floor |
| 10 | Squash merges | merge commits |
| 11 | No tests yet, per the brief to this plan. The first test to add is an eight-line golden test: `countFrames(sample) === N`. Both reviewers would add it in PR 2 so the test runner is real rather than wired | add it in PR 2 |
| 12 | `wrangler` in `devDependencies` | install on demand with `npx wrangler deploy`, which spares an assessor the workerd download |
| 13 | Workers Builds deploys; GitHub Actions only checks | an Actions `deploy` job with `cloudflare/wrangler-action@v4` and two repo secrets, if the deploy step must be visible in the repo |

---

## 15. Changed in revision 3 (after the two reviews)

Every individual reviewer recommendation and what happened to it is in section 17.

Cut:
- The GitHub Actions `deploy` job, its two secrets, the API token, the `environment` block and `concurrency`. Workers Builds does the deploying.
- `upload.ts` and the `mp3/` folder: six source files became three.
- The `FrameCounter` class: one `countFrames` function.
- The emphasis check: ffmpeg and mediainfo accept the reserved value, so rejecting it could zero a valid file.
- Two of the four multipart `400` messages; the separate docs PR and deploy PR (six PRs became four); elapsed time and the raw-JSON panel in the UI.
- `workers_dev: false`; preview URLs use the workers.dev subdomain.

Added or fixed:
- The Info-frame ambiguity is now a documented, evidenced decision instead of a tie-break that depends on which mediainfo version the assessor ran.
- `Content-Type: application/json` without charset, which is what Hono sends.
- A 100 MB cap with `413` on the multipart path, so a multi-gigabyte `-F` upload cannot take down the local process.
- `.gitattributes` for LF on Windows; Biome `vcs` settings.
- Guards in the algorithm for the end-of-input paths; ID3 footer gated on v2.4.
- Quoted `@path` in every curl example (PowerShell splatting), `PORT` note, `Number(PORT) || 3000`.
- Action majors bumped to the current 7.x; `nb_read_frames` as the ffprobe reference instead of packets.

Kept after reconsideration: raw-body ingress; Vitest with no tests; `wrangler` as a devDependency.

---

## 16. "With more time" (goes in the README, good interview material)

- Two-frame lookahead when resyncing, to reject false sync words in junk.
- Read the Xing `frames` field at request time and report a mismatch against the scanned count.
- Free-format bitrate, MPEG-2 / 2.5, Layer I / II.
- A streaming multipart parser so the multipart path has the same memory profile as the raw path and needs no cap.
- Tests: the golden test, header table cases, boundary splits (feed `countFrames` a `ReadableStream.from` of 1-byte chunks), the ffmpeg fixtures, `app.request()` integration tests for every row of the HTTP matrix.
- Extra metadata (duration, bitrate mode, sample rate) on a second endpoint, keeping the specified response exact.
- Rate limiting via a Cloudflare WAF rule.

---

## 17. Review log and spike results

Two independent reviewers read revision 2 and the assignment brief. S = simplicity reviewer ("is this more than the brief needs?"), R = requirements and facts reviewer (verified against Hono, node-server, tsx, FFmpeg, MediaInfoLib and Cloudflare sources).

| # | Recommendation | Outcome | Where |
|---|---|---|---|
| S1 | Drop the Actions deploy job, secrets, token and environment; deploy with Workers Builds | Adopted | 2, 9, 10 |
| S2 | Collapse six source files to `app.ts`, `server.ts`, `mp3.ts`; function instead of `FrameCounter` class | Adopted | 3, 4.5 |
| S3 | Add one eight-line golden test in PR 2 so the test runner is real | **Declined for now**: the brief to this plan says no tests yet. Listed as the first test to add | 14 (assumption 11) |
| S4 | No separate docs PR; README grows inside each PR | Adopted | 12 |
| S5 | Quote every `@path` for PowerShell; `-F` as the primary example; mention `PORT` | Adopted | 5, 13 |
| S6 | Trim the UI to input, button, result | Adopted | 6 |
| S7 | Take `wrangler` out of `devDependencies`, run it with `npx` | **Declined**: lockfile pinning wins; unsupported platforms skip the optional workerd binary rather than failing `npm install` | 14 (assumption 12) |
| S8 | Merge the empty-body and empty-file 400s | Adopted (one `NO_FILE` message) | 5 |
| S9 | Drop `concurrency` from the workflow | Adopted | 9 |
| S10 | The 10 ms Free-plan CPU cap makes the live demo ceiling far below 100 MB; measure or pay | Adopted: measure after first deploy, Paid plan if close | 10, 14 (assumption 2) |
| S11 | Reword the zero-frames message so an MPEG-2 file is not told it "is not an MP3" | Adopted | 5 |
| S12 | Keep raw-body ingress, streaming, Biome, Hono, 400 on zero frames, PR-per-step, `v1.0.0` tag | Kept | 2 |
| R1 | The "flip if mediainfo disagrees" rule is unreliable: mediainfo before 26.10 reports N+1 for CBR files, 26.10+ and ffprobe report N | Adopted: exclude on principle, prove with the Xing `frames` field and ffprobe, state both numbers in the README | 11, 13, 14 (assumption 5) |
| R2 | Hono's `c.json` sends `application/json` with no charset | Adopted | 5, 11 |
| R3 | Action majors were stale (checkout 7, setup-node 7, wrangler-action 4) | Adopted (wrangler-action no longer used) | 9 |
| R4 | ffprobe `nb_read_packets` can be one high because of an ID3v1/APE tail; use `nb_read_frames` | Adopted | 11 |
| R5 | Do not reject emphasis value 2; ffmpeg and mediainfo accept it | Adopted | 4.1 |
| R6 | Two production errors are Cloudflare HTML, not our JSON (413 over 100 MB, Error 1102 over CPU) | Adopted: README limits section, 50 MB test before submission | 5, 10 |
| R7 | The local multipart path has no cap; a multi-gigabyte `-F` upload kills the Node process | Adopted: 100 MB cap, `413` JSON, before anything is buffered | 2, 5 |
| R8 | Algorithm guards for the end-of-input paths; ID3 footer only exists in v2.4; soften the junk row | Adopted | 4.3, 4.4, 4.6 |
| R9 | `.gitattributes` for LF on Windows; Biome `vcs` settings | Adopted | 8 |
| R10 | `gh pr checks --watch` right after `gh pr create` can report no checks; squash uses the commit message for single-commit PRs | Adopted | 9 |
| R11 | `serveStatic({ path })` is undocumented; cwd-relative | Adopted with change: the documented `root` form; npm always runs scripts from the package root | 5 |
| R12 | `Number(process.env.PORT ?? 3000)` gives port 0 when `PORT` is empty | Adopted (`Number(PORT) \|\| 3000`) | 5 |
| R13 | Phrase assets routing as "`/file-upload` matches no asset", not "POST bypasses assets" | Adopted | 8 |
| R14 | API token permissions for custom domains | Moot: Workers Builds | 10 |
| R15 | Add the imports to the `app.ts` sketch; note that Node's native `.ts` loader does not resolve extensionless imports | Adopted | 5, 14 (assumption 9) |
| R16 | README: print the expected count for the sample on the first screen; the exact PowerShell line; one line on 400 vs 415 | Adopted | 5, 13 |
| R17 | Use `fileURLToPath(import.meta.url)` so `server.ts` survives other working directories | Declined: `npm start` always runs from the package root; one comment says so | 5 |

### Toolchain spike (2026-10-30, throwaway, in the session scratchpad)

A hello-world Hono app was created with the exact `package.json`, `tsconfig.json` and `biome.json` from section 8 (minus `wrangler`) and the `server.ts` from section 5, plus a `/echo` route that exercises the same request plumbing as `uploadStream` without any MP3 parsing. It was not copied into the project. Results on this machine (Windows 10, Node 24.19, npm 11):

| Step | Result |
|---|---|
| `npm install` | 46 packages in 19 s; resolved hono 4.13.14, @hono/node-server 2.1.5, tsx 4.23.15, typescript 7.0.2, @types/node 24.19.2, @biomejs/biome 2.6.4, vitest 5.0.5 |
| `biome ci .` | passes after `biome check --write .` (the `vcs.useIgnoreFile` setting works in a fresh `git init`) |
| `tsc --noEmit` (TypeScript 7.0.2) | passes with the planned flags, including `for await` over `req.body`, `instanceof File`, `HTTPException`, and `c.json(body, 405, { Allow })` |
| `vitest run --passWithNoTests` (5.0.5) | exits 0 with no test files |
| `PORT=3100 npm start` | listens on 3100; `GET /` returns `public/index.html` as `text/html` via `serveStatic({ root })` |
| multipart `-F "file=@..."` | `File` arrives with correct size and name on Node 24 |
| raw body, no `Content-Type` | streams; a 71 KB body arrived in 2 chunks, so chunk-boundary handling is exercised locally, not only on Workers |
| `GET /echo` | `405` JSON with `allow: POST` |
| `GET /nope` | `404` JSON |
| JSON responses | `Content-Type: application/json`, no charset (confirms R2) |
| `curl -X POST` with no body | **Finding:** Node delivers an empty stream and no `Content-Length` header, so a body-null check alone would not catch it (the counter would still answer `400`, but with the "no frames" message). Fixed in the `app.ts` sketch: no `Content-Length` and no `Transfer-Encoding` means no body |
| Linux, Node 20 (the `engines` floor) | the same spike, lockfile included, run in the official `node:20` Docker image (Node 20.20.2, npm 10.8, Debian x86_64): `npm ci`, `npm run check`, `npm test`, `npm start`, static page, multipart, raw body in 2 chunks, 405, 404 all pass identically. The lockfile written on Windows installs cleanly on Linux, which is what CI and an assessor do |

Not covered by the spike, by design: the MP3 parser (PR 2), Workers runtime behaviour (`npx wrangler dev` or the first deploy), macOS (no machine available; the fresh-machine check in section 11 covers it before submission if one is at hand, and Linux plus Windows passing on the same lockfile makes a macOS surprise unlikely).
