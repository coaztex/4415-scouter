import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import sharp from "sharp";
import manifest from "../src/app/manifest";

test("manifest has standalone display and real install icon sizes", async () => {
  const data = manifest();
  assert.equal(data.display, "standalone");
  assert.equal(data.start_url, "/events");
  for (const size of [192, 512]) {
    const icon = data.icons?.find((item) => item.sizes === `${size}x${size}`);
    assert.ok(icon?.src);
    const metadata = await sharp(`public${icon.src}`).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
  }
});

test("service worker intercepts only public static files", async () => {
  const listeners = new Map<string, (event: unknown) => void>();
  const source = await readFile("public/sw.js", "utf8");
  runInNewContext(source, {
    self: {
      location: { origin: "https://scout.example" },
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        listeners.set(name, handler),
    },
    URL,
    caches: {
      open: async () => ({ match: async () => new Response("cached") }),
    },
    Response,
  });
  const handler = listeners.get("fetch");
  assert.ok(handler);
  const intercepts = (path: string, method = "GET", mode = "cors") => {
    let intercepted = false;
    handler({
      request: { url: `https://scout.example${path}`, method, mode },
      respondWith: () => {
        intercepted = true;
      },
    });
    return intercepted;
  };
  assert.equal(intercepts("/_next/static/chunks/app.js"), true);
  assert.equal(intercepts("/icons/icon-192.png"), true);
  for (const path of [
    "/events",
    "/events?foo=bar",
    "/api/scouting/sync",
    "/api/events/2026test/refresh-check",
    "/_next/data/private.json",
    "/_next/image?url=private",
    "/login",
  ])
    assert.equal(intercepts(path), false, path);
  assert.equal(intercepts("/_next/static/chunks/app.js", "POST"), false);
  assert.equal(
    intercepts("/_next/static/chunks/app.js", "GET", "navigate"),
    false,
  );
});
