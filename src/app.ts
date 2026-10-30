import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { countFrames } from "./mp3";
import { Trace } from "./trace";

// formData() reads the whole body into memory, on Node and on Workers alike, so
// multipart uploads are capped. Raw bodies are streamed and need no cap.
// 100 MB is also Cloudflare's request size limit, so local and production agree.
const MAX_MULTIPART_BYTES = 100 * 1024 * 1024;

const NO_FILE =
  "No file received. Send the MP3 as multipart/form-data with a 'file' field, or as the raw request body.";
const TOO_LARGE =
  "Multipart uploads are limited to 100 MB. Send larger files as the raw request body.";
const NO_LENGTH =
  "Multipart uploads need a Content-Length header. Send the file as the raw request body instead.";
const NOT_MP3 =
  "No MPEG-1 Layer III frames found. Only that format (standard .mp3) is supported.";

// strict: false lets "/file-upload/" match "/file-upload" too.
const app = new Hono({ strict: false });

app.post("/file-upload", async (c) => {
  // `?trace`, `?trace=1` or `?trace=true` adds a step-by-step explanation, used by the
  // upload page. Without it the response is exactly the specified {"frameCount": n}.
  const traceParam = c.req.query("trace");
  const wantTrace = ["", "1", "true"].includes(traceParam ?? "off");
  const trace = wantTrace ? new Trace() : undefined;
  const started = performance.now();

  const upload = await uploadStream(c.req.raw);
  const frameCount = await countFrames(upload.stream, trace?.record);

  // Zero frames almost always means the file is not an MP3. Saying so beats answering 0.
  const status = frameCount > 0 ? 200 : 400;
  const body = frameCount > 0 ? { frameCount } : { error: NOT_MP3 };
  if (!trace) return c.json(body, status);

  const steps = trace.steps(upload.via, status, performance.now() - started);
  // The song's details, when the ID3 tag has any. Only with ?trace.
  const song = trace.song();
  return c.json({ ...body, ...(song && { song }), trace: steps }, status);
});

// Hono does not send 405 on its own. Registered after .post, so only other methods land here.
app.all("/file-upload", (c) =>
  c.json({ error: "Method not allowed" }, 405, { Allow: "POST" }),
);

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  // A client that hangs up mid-upload is not a server fault, and nobody reads the reply.
  if (!c.req.raw.signal.aborted) console.error(err); // detail to the log, never the client
  return c.json({ error: "Internal server error" }, 500);
});

/**
 * Returns the uploaded bytes as a stream: the 'file' part of a multipart form, or
 * otherwise the raw body. Any non-multipart Content-Type counts as raw, so
 * `curl --data-binary @song.mp3` works even though curl labels it a form.
 * Whether the bytes are really an MP3 is left to the parser.
 */
async function uploadStream(req: Request): Promise<{
  stream: ReadableStream<Uint8Array>;
  via: "raw" | "multipart";
}> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  const contentLength = req.headers.get("content-length");

  if (!contentType.startsWith("multipart/form-data")) {
    // A request without Content-Length or Transfer-Encoding has no body (RFC 9112).
    // Node still hands over an empty stream, so check the headers, not just req.body.
    const hasBody =
      contentLength !== null || req.headers.has("transfer-encoding");
    if (!req.body || !hasBody || contentLength === "0") {
      throw new HTTPException(400, { message: NO_FILE });
    }
    return { stream: req.body, via: "raw" };
  }

  // The size check needs a declared length. Without one (a chunked upload) the whole
  // form would be buffered unchecked, so refuse it. Browsers and curl always send one.
  if (contentLength === null) {
    throw new HTTPException(411, { message: NO_LENGTH });
  }
  if (Number(contentLength) > MAX_MULTIPART_BYTES) {
    throw new HTTPException(413, { message: TOO_LARGE });
  }
  const form = await req.formData().catch(() => null); // malformed form: same as no file
  const file = form?.get("file"); // with several 'file' fields, the first one is used
  if (!(file instanceof File) || file.size === 0) {
    throw new HTTPException(400, { message: NO_FILE });
  }
  return { stream: file.stream(), via: "multipart" };
}

// Cloudflare Workers runs this object directly; server.ts wraps it for Node.
export default app;
