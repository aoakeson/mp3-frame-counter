---
type: Playbook
title: Testing
description: How to run the tests and check a count against ffprobe.
tags: [testing, vitest, ffprobe]
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-30T00:00:00Z }
---

# Automated

```bash
npm test
```

14 Vitest tests, under a second. CI runs them with `npm run check` and `npm run build` on every pull request.

- `src/mp3.test.ts`: counts for three files match ffprobe (sample 6089, the-entertainer 11726, brian-borus-march 5622); the count is unchanged by 1- and 3-byte chunks and by junk around the audio; non-MP3, MPEG-2 and empty input count 0.
- `src/app.test.ts`: multipart and raw uploads return `{"frameCount": 6089}`; `400`, `404` and `405` responses.

# By hand

```bash
npm start
curl -F "file=@samples/sample.mp3" http://localhost:3000/file-upload
```

On Windows PowerShell, use `curl.exe`.

# Checking a count

Expected counts come from ffprobe, never from this counter:

```bash
ffprobe -v error -select_streams a:0 -count_frames -show_entries stream=nb_read_frames -of default=nw=1:nk=1 samples/sample.mp3
```

A one-off comparison covered 263 files: real-world MP3s, generated files for every MPEG-1 bitrate and sample rate, other formats, and hostile files. All matched.
