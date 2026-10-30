---
type: Algorithm
title: Frame counting
description: How the counter finds and counts MPEG-1 Layer III frames in a stream.
resource: https://github.com/aoakeson/mp3-frame-counter/blob/main/src/mp3.ts
tags: [mp3, parsing, streaming]
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-30T00:00:00Z }
---

# Steps

All of it is in `src/mp3.ts`, which imports nothing.

1. **Skip the ID3v2 tag.** Its header states its size, so it is jumped over whole. Scanning through it could mistake cover-art bytes for frames.
2. **Read a frame header.** Four bytes: sync bits, version, layer, bitrate, sample rate, padding. Only MPEG-1 Layer III is accepted.
3. **Jump to the next frame.** Frame length is `floor(144 × bitrate / sampleRate) + padding` bytes. Variable bitrate needs nothing special, because each header gives its own length.
4. **Don't count the Xing/Info frame.** See [Excluding the Xing/Info frame](xing-frame.md).
5. **Resync on anything else.** Junk, corrupt data and trailing tags are passed over a byte at a time. After losing sync, a header is trusted only if another header follows exactly where its frame ends.

# Properties

- The upload is read as a stream, one chunk at a time. Memory stays flat whatever the file size.
- The count does not depend on how the bytes are chunked.
- Work is proportional to the number of frames, except with chunks of only a few bytes, where it slows sharply.
- Other formats (MPEG-2, MPEG-2.5, Layers I and II, WAV, FLAC and so on) count 0, and the API answers `400`.
