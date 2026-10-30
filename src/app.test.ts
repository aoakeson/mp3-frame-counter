import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import app from "./app";

const sample = readFileSync("samples/sample.mp3");

/** POSTs `body` with an explicit Content-Length, as curl and browsers send. */
async function post(body: Uint8Array | FormData) {
  const encoded = new Request("http://x", { method: "POST", body });
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  const headers = new Headers({ "content-length": String(bytes.length) });
  const type = encoded.headers.get("content-type");
  if (type) headers.set("content-type", type);
  return app.request("/file-upload", { method: "POST", body: bytes, headers });
}

function form(bytes: Uint8Array, field = "file") {
  const data = new FormData();
  data.append(field, new File([bytes], "upload.mp3"));
  return data;
}

describe("POST /file-upload", () => {
  it("counts a multipart upload", async () => {
    const res = await post(form(sample));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ frameCount: 6089 });
  });

  it("counts a raw body upload", async () => {
    const res = await post(sample);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ frameCount: 6089 });
  });

  it("answers 400 for a file that is not an MP3", async () => {
    const res = await post(form(readFileSync("package.json")));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /No MPEG-1 Layer III frames/,
    );
  });

  it("answers 400 when no file is sent", async () => {
    const res = await post(form(sample, "other"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(
      /No file received/,
    );
  });
});

describe("other requests", () => {
  it("answers 405 with Allow: POST for other methods", async () => {
    const res = await app.request("/file-upload");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });

  it("answers 404 for unknown paths", async () => {
    const res = await app.request("/nope", { method: "POST" });
    expect(res.status).toBe(404);
  });
});
