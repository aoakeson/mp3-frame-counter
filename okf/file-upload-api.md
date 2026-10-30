---
type: API Endpoint
title: File upload API
description: The POST /file-upload endpoint, its options and its responses.
resource: https://mp3.andrewoakeson.com/file-upload
tags: [api, http]
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-30T00:00:00Z }
---

# Request

`POST /file-upload` with the MP3 either as a `multipart/form-data` field named `file`, or as the raw request body (streamed, suits large files). The parser, not the file name or `Content-Type`, decides whether it is an MP3.

| Query     | Adds                                                             |
| --------- | ---------------------------------------------------------------- |
| (none)    | Nothing. The body is exactly `{"frameCount": n}`.                |
| `?trace`  | A step-by-step explanation, and song details from the ID3v2 tag. |
| `?frames` | Every frame's offset, size and bitrate, for the page's player.   |

# Responses

All JSON.

| Status | When                                                                 |
| ------ | -------------------------------------------------------------------- |
| `200`  | At least one frame found: `{"frameCount": n}`                        |
| `400`  | No file, empty file, malformed form, or not an MPEG-1 Layer III file |
| `405`  | Any method other than `POST`, with `Allow: POST`                     |
| `411`  | A multipart upload without `Content-Length`                          |
| `413`  | A multipart upload over 100 MB                                       |
| `404`  | Any other path                                                       |
| `500`  | Unexpected failure; details go to the server log only                |

# Examples

```bash
curl -F "file=@samples/sample.mp3" https://mp3.andrewoakeson.com/file-upload
# {"frameCount":6089}
```

```bash
curl --data-binary "@samples/sample.mp3" http://localhost:3000/file-upload
```
