import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import app from "./app";

// On Cloudflare the platform serves the built page (dist/) before the Worker runs.
// Locally Node has to do it, so that wiring lives here rather than in app.ts.
// The path is relative to the working directory; npm runs scripts from the project root.
app.use("/*", serveStatic({ root: "./dist" }));

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, () => {
  console.log(`Listening on http://localhost:${port}`);
});
