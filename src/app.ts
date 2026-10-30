import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const app = new Hono();

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err); // Full detail goes to the log, never to the client.
  return c.json({ error: "Internal server error" }, 500);
});

// Cloudflare Workers runs this object directly; server.ts wraps it for Node.
export default app;
