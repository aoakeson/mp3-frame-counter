# MP3 Frame Counter

An HTTP API that counts the audio frames in an MP3 (MPEG-1 Layer III) file.
The MP3 parsing is written by hand in TypeScript; no audio libraries are used.

Live at **https://mp3.andrewoakeson.com**. The included `samples/sample.mp3` has **6089** frames.

```bash
curl -F "file=@samples/sample.mp3" https://mp3.andrewoakeson.com/file-upload
```

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer. Nothing else: no accounts, no global tools.

```bash
npm install
npm start
```

`npm start` builds the upload page, then the server prints `Listening on http://localhost:3000`.
To use a different port, set `PORT` (`PORT=3001 npm start`, or in PowerShell `$env:PORT=3001; npm start`).

## Try it

In a second terminal, from the project folder:

```bash
curl -F "file=@samples/sample.mp3" http://localhost:3000/file-upload
```

```json
{ "frameCount": 6089 }
```

On Windows PowerShell, type `curl.exe` instead of `curl`, because `curl` there is an alias for a different command.

Or open http://localhost:3000 in a browser, click **Try the sample**, and open any step to see an animation of it and the code that ran.

The sidebar lists 20 more example MP3s: public domain recordings (U.S. military bands, Musopen, NASA) with public domain paintings as covers. Click one to count its frames or press play to listen. They cover CBR from 128 to 320 kbps, VBR, 44.1 and 48 kHz, ID3v1 and ID3v2 tags, and one MPEG-2 clip (_The Eagle Has Landed_) that shows the unsupported-format error. Sources and licenses are in [samples/library/CREDITS.md](samples/library/CREDITS.md).

While a track plays, a bar along the bottom draws its frames as a moving tape. Every frame is the same 1,152 samples (about 26 ms), so the bars are equally wide; each bar's height is the bytes the encoder spent on that frame. Constant bitrate files make a flat wall, variable bitrate files a skyline that dips in quiet passages. The server finds every frame with `?frames` (it never decodes audio, and maps a whole song in tens of milliseconds); the browser's playback clock picks the frame being heard, `time × sampleRate / 1152`. A strip of the whole song underneath seeks when clicked.

## API

### `POST /file-upload`

Send the MP3 in either of two ways:

- **As a form upload** (`multipart/form-data`) with the file in a field named `file`, as above.
- **As the raw request body**, which is streamed and suits large files:

```bash
curl --data-binary "@samples/sample.mp3" http://localhost:3000/file-upload
```

The file name and `Content-Type` are not used to decide whether the upload is an MP3; the parser decides.
That is why a non-MP3 file gets `400` rather than `415`.
If a form has several `file` fields, the first one is counted.

Every response is JSON with `Content-Type: application/json`:

| Status | Body                                                               | When                                                         |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `200`  | `{"frameCount": 6089}`                                             | At least one frame was found                                 |
| `400`  | `{"error": "No file received. ..."}`                               | Empty body, no `file` field, empty file, or a malformed form |
| `400`  | `{"error": "No MPEG-1 Layer III frames found. ..."}`               | The file is not an MP3, or is another MPEG format            |
| `405`  | `{"error": "Method not allowed"}`                                  | Any method other than `POST`; the `Allow` header says `POST` |
| `411`  | `{"error": "Multipart uploads need a Content-Length header. ..."}` | A form upload sent in chunks, without a declared size        |
| `413`  | `{"error": "Multipart uploads are limited to 100 MB. ..."}`        | A form upload over 100 MB. Raw bodies have no limit locally  |
| `404`  | `{"error": "Not found"}`                                           | Any other path                                               |
| `500`  | `{"error": "Internal server error"}`                               | Unexpected failure; details go to the server log only        |

### `POST /file-upload?trace`

The same request with `?trace` (or `?trace=1`, `?trace=true`) also explains what happened, step by step. The upload page uses it.
Without it, or with any other value such as `?trace=false`, the response is exactly `{"frameCount": n}`.

```json
{
  "frameCount": 6089,
  "trace": [
    {
      "kind": "id3",
      "title": "Skipped an ID3v2.4 tag",
      "detail": "44 bytes of metadata at the start, jumped over by its declared size.",
      "code": { "file": "src/mp3.ts", "start": "function id3v2TagLength(" }
    }
  ]
}
```

Each step names the function that did the work. The page shows that function's source, bundled from the same files the server runs.
Most steps also carry a `picture`: the real numbers behind that step's animation on the page, such as the ID3 tag's size or the first frame's bitrate and length.

When the file has an ID3v2.3 or v2.4 tag with song details, the response also has a `song` object: `title`, `artist`, `album`, `year`, `genre`, `track` and `cover`, each only when present. `cover` is the front cover as a `data:` URL. Tags over 5 MB are not read. The details are read from the tag's bytes as they stream past, so the count is unaffected, and nothing is stored. The code is in [src/tags.ts](src/tags.ts).

### `POST /file-upload?frames`

`?frames` adds where every audio frame is, as parallel arrays. The page's player draws them in time with playback. It combines with `?trace`.

```json
{
  "frameCount": 4478,
  "frames": {
    "samplesPerFrame": 1152,
    "sampleRate": 48000,
    "offsets": [1328, 2000, 2480],
    "sizes": [672, 480, 480],
    "bitratesKbps": [224, 160, 160],
    "ms": 9
  }
}
```

`offsets` are bytes from the start of the file, and `ms` is how long the server spent reading and counting it. Frame `i` plays from `i × samplesPerFrame / sampleRate` seconds. The code is in [src/frames.ts](src/frames.ts).

### `GET /`

The upload page.

### `GET /how-it-works/`

A plain-language explanation of the whole project, with an animated picture for each idea and a glossary.

## How counting works

For a gentler, illustrated version of this section, open `/how-it-works/` in the running app.

All of it is in [src/mp3.ts](src/mp3.ts), which imports nothing.

1. **Skip the ID3v2 tag.** Most files start with one (title, cover art). Its header states its size, so it is jumped over whole. Scanning through it could mistake cover-art bytes for frames.
2. **Read a frame header.** Four bytes: sync bits, version, layer, bitrate, sample rate, padding. Only MPEG-1 Layer III is accepted.
3. **Jump to the next frame.** Frame length is `floor(144 × bitrate / sampleRate) + padding` bytes, so frames are skipped, never scanned. Variable bitrate needs nothing special, because each header gives its own length.
4. **Don't count the Xing/Info frame.** The first frame of most files is a valid frame that holds encoder metadata instead of audio.
5. **Resync on anything else.** Junk, corrupt data and trailing tags are passed over one byte at a time. After losing sync, a header is trusted only if another header follows exactly where its frame ends, so random bytes that happen to look like a header are not counted.

The upload is processed as a stream, one chunk at a time. Memory use stays flat whatever the file size, and the work is proportional to the number of frames.

### Why the Xing/Info frame is excluded

That frame has a valid header but carries no audio. The encoder records the number of audio frames inside it, excluding itself, and ffmpeg skips it too. For `samples/sample.mp3` all three agree:

| Source                        | Frames |
| ----------------------------- | ------ |
| This API                      | 6089   |
| Xing header's own frame count | 6089   |
| `ffprobe` decoded frames      | 6089   |

Counting raw headers instead would give 6090.
Note that mediainfo releases older than 26.10 report one extra frame for _constant_ bitrate files with an Info header, because they count that frame. The sample is variable bitrate, so mediainfo reports the Xing value either way.

### Verify it yourself

```bash
ffprobe -v error -select_streams a:0 -count_frames -show_entries stream=nb_read_frames -of default=nw=1:nk=1 samples/sample.mp3
```

```bash
mediainfo --Inform="Audio;%FrameCount%" samples/sample.mp3
```

ffprobe's decoded count can be one lower than the number of frames in a file. When gapless-playback data marks a whole last frame as padding, the decoder drops that frame. `-count_packets` with `nb_read_packets` counts it, but also counts junk at the ends of a file as packets.

### How it was tested

The counter was compared against ffprobe and against each file's own Xing/Info/VBRI frame count, with every file also fed in random chunk sizes to check the count never depends on how the upload arrives.

| Files                                                                                                                 | Count | Result                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------ |
| Real-world MP3s from many encoders                                                                                    | 138   | All agree with ffprobe, allowing for the padding frame above |
| Generated: every MPEG-1 sample rate × bitrate, VBR 0–9, mono, with and without Xing, ID3 v2.3/v2.4/v1, 1 MB cover art | 69    | All match ffprobe                                            |
| Other formats: MPEG-2/2.5, Layer II, WAV, FLAC, Ogg, Opus, AAC                                                        | 13    | All 0 frames                                                 |
| Hostile: broken ID3 sizes, fake frames inside tags, junk and sync-byte floods, bit flips, truncation, joined files    | 43    | All correct                                                  |

Every one of the 148 files with an encoder frame count matched it exactly.
A 1 GB upload streamed through with the server's memory flat at about 75 MB.
An MP3 stored inside a Matroska (`.mkv`) container counts 0. That is a container, not an MP3 file: it puts a small header between frames, so no two frame headers line up.

## Development

| Command           | What it does                                                                    |
| ----------------- | ------------------------------------------------------------------------------- |
| `npm start`       | Build the page and run the server                                               |
| `npm run dev`     | Run the server and restart on file changes                                      |
| `npm run dev:web` | Serve the page with hot reload on port 5173, calling the API from `npm run dev` |
| `npm run build`   | Build the page into `dist/` ([Vite](https://vite.dev))                          |
| `npm run check`   | Lint, format check ([Biome](https://biomejs.dev)) and type check (`tsc`)        |
| `npm run fix`     | Apply lint and format fixes                                                     |
| `npm test`        | Run tests ([Vitest](https://vitest.dev))                                        |
| `npm run deploy`  | Build and deploy to Cloudflare Workers                                          |

```
src/                The API. Runs unchanged on Node and on Cloudflare Workers.
  app.ts            HTTP routes and error handling.
  mp3.ts            The frame counter. No dependencies.
  trace.ts          Turns the counter's events into the steps shown by ?trace.
  frames.ts         Collects every frame's offset, size and bitrate for ?frames.
  server.ts         Starts the app on Node for local use.
web/                The upload page: React, Tailwind CSS and shadcn/ui components.
  app.tsx           The page.
  code.tsx          Shows the server function behind each trace step.
  examples.tsx      The sidebar of example MP3s: play one, or click it to count it.
  library.ts        The example tracks.
  player.tsx        The player bar and its frame tape, synced to playback.
  components/ui/    shadcn/ui components (Trace, Button, Card, Spinner, Collapsible).
samples/
  sample.mp3        The sample file provided with the assessment, also served by the page.
  library/          The example MP3s and their covers, served at /library/. CREDITS.md lists sources.
```

CI runs `npm run check`, `npm run build` and `npm test` on every pull request ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## Deployment

The same `src/app.ts` runs on [Cloudflare Workers](https://developers.cloudflare.com/workers/), configured in [wrangler.jsonc](wrangler.jsonc).
Cloudflare serves the built page in `dist/` directly, and every other request reaches the Worker.

```bash
npx wrangler login
```

```bash
npm run deploy
```

To deploy automatically on every merge to `main`, connect the repository once in the Cloudflare dashboard: Workers & Pages, the `mp3-frame-counter` Worker, Settings, Builds.

## Limits

|                | Local (Node)       | Cloudflare                       |
| -------------- | ------------------ | -------------------------------- |
| Raw body size  | No limit; streamed | 100 MB on Free and Pro plans     |
| Multipart size | 100 MB             | 100 MB                           |
| Over the limit | JSON `413`         | Cloudflare's own HTML `413` page |

CPU time measured on Cloudflare:

| Upload                     | CPU    |
| -------------------------- | ------ |
| Sample (1.4 MB), multipart | 14 ms  |
| Sample (1.4 MB), raw body  | 46 ms  |
| 50 MB, raw body            | 450 ms |
| 50 MB, multipart           | 960 ms |

The Workers Free plan stops a request after 10 ms of CPU time with Cloudflare's "Error 1102" page. These numbers need the Paid plan, which allows 30 seconds.

## With more time

- **Tests.** Vitest is wired but there are no tests yet. First: a golden test that the sample counts 6089. Then header edge cases, the same file split into 1-byte chunks, and `app.request()` tests for every status code in the API table.
- **Streaming multipart.** `formData()` buffers the whole upload. A streaming multipart parser would give form uploads the same flat memory use as raw bodies and remove the 100 MB cap.
- **Cross-check the Xing count.** The trace already shows the frame count the Xing header declares. Flag it when that differs from the scanned count.
- **More formats.** MPEG-2 and 2.5, Layers I and II, and free-format bitrate are out of scope and currently count as 0 frames.
