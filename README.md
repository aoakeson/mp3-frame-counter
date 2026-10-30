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
public/
  index.html  The upload page.
```
