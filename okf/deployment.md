---
type: Runbook
title: Deployment
description: Running locally on Node and in production on Cloudflare Workers.
resource: https://mp3.andrewoakeson.com
tags: [deployment, cloudflare, node]
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-30T00:00:00Z }
---

# Local

Node 20 or newer, nothing else.

```bash
npm install
npm start   # http://localhost:3000; set PORT to change it
```

`src/server.ts` wraps the app for Node and serves the built page from `dist/`.

# Production

The same `src/app.ts` runs on Cloudflare Workers, configured in `wrangler.jsonc`. Cloudflare serves `dist/` directly; every other request reaches the Worker.

```bash
npx wrangler login
npm run deploy
```

# Limits

|           | Local              | Cloudflare |
| --------- | ------------------ | ---------- |
| Raw body  | No limit; streamed | 100 MB     |
| Multipart | 100 MB             | 100 MB     |

The sample uses 14 to 46 ms of CPU on Cloudflare, over the Free plan's 10 ms, so the Worker needs the Paid plan.
