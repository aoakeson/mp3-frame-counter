---
okf_version: "0.2"
---

# MP3 Frame Counter

Knowledge about this project in [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf): one markdown file per concept, each with YAML frontmatter. Read by people and by AI agents.

# How it works

- [Frame counting](frame-counting.md) - How the counter finds and counts MPEG-1 Layer III frames in a stream.
- [Excluding the Xing/Info frame](xing-frame.md) - Why the first metadata frame is not counted, so the sample gives 6089.

# Using it

- [File upload API](file-upload-api.md) - The POST /file-upload endpoint, its options and its responses.
- [Testing](testing.md) - How to run the tests and check a count against ffprobe.
- [Deployment](deployment.md) - Running locally on Node and in production on Cloudflare Workers.
