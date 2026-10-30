# MP3 Frame Counter

An HTTP API that counts the audio frames in an MP3 (MPEG-1 Layer III) file.
The MP3 parsing is written by hand in TypeScript; no audio libraries are used.

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer. Nothing else: no accounts, no build step.

```bash
npm install
npm start
```

The server prints `Listening on http://localhost:3000`.
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

Every response is JSON with `Content-Type: application/json`:

| Status | Body                                                        | When                                                         |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------ |
| `200`  | `{"frameCount": 6089}`                                      | At least one frame was found                                 |
| `400`  | `{"error": "No file received. ..."}`                        | Empty body, no `file` field, empty file, or a malformed form |
| `400`  | `{"error": "No MPEG-1 Layer III frames found. ..."}`        | The file is not an MP3, or is another MPEG format            |
| `405`  | `{"error": "Method not allowed"}`                           | Any method other than `POST`; the `Allow` header says `POST` |
| `413`  | `{"error": "Multipart uploads are limited to 100 MB. ..."}` | A form upload over 100 MB. Raw bodies have no limit locally  |
| `404`  | `{"error": "Not found"}`                                    | Any other path                                               |
| `500`  | `{"error": "Internal server error"}`                        | Unexpected failure; details go to the server log only        |

### `GET /`

A small upload page.

## How counting works

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

## Development

| Command          | What it does                                                             |
| ---------------- | ------------------------------------------------------------------------ |
| `npm start`      | Run the server                                                           |
| `npm run dev`    | Run the server and restart on file changes                               |
| `npm run check`  | Lint, format check ([Biome](https://biomejs.dev)) and type check (`tsc`) |
| `npm run fix`    | Apply lint and format fixes                                              |
| `npm test`       | Run tests ([Vitest](https://vitest.dev))                                 |
| `npm run deploy` | Deploy to Cloudflare Workers                                             |

```
src/
  app.ts      HTTP routes and error handling. Runs unchanged on Node and on Cloudflare Workers.
  server.ts   Starts the app on Node for local use.
  mp3.ts      The frame counter. No dependencies.
public/
  index.html  The upload page.
samples/
  sample.mp3  The sample file provided with the assessment.
```
