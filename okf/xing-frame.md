---
type: Decision
title: Excluding the Xing/Info frame
description: Why the first metadata frame is not counted, so the sample gives 6089.
tags: [mp3, xing, decision]
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-30T00:00:00Z }
---

# Decision

The first frame of most MP3 files is a Xing (VBR) or Info (CBR) frame. It has a valid frame header but carries encoder metadata instead of audio. The counter does not count it.

# Why

- The encoder records the number of audio frames inside that frame, excluding itself.
- ffmpeg and ffprobe skip it too.
- For `samples/sample.mp3` all three agree on **6089**. Counting raw headers would give 6090.

| Source                        | Frames |
| ----------------------------- | ------ |
| This API                      | 6089   |
| Xing header's own frame count | 6089   |
| `ffprobe` decoded frames      | 6089   |

# Caveats

- ffprobe's decoded count can be one lower than the frames in a file when gapless-playback data marks the whole last frame as padding.
- mediainfo releases older than 26.10 count the Info frame in constant bitrate files, so they report one more.
