import assert from "node:assert/strict";
import test from "node:test";
import { readBoundedBody } from "../src/lib/server/bounded-body";

test("request body reader enforces limits without trusting Content-Length", async () => {
  const exact = new Request("https://example.test", {
    method: "POST",
    body: "12345",
  });
  const exactBody = await readBoundedBody(exact, 5);
  assert.ok(exactBody);
  assert.equal(new TextDecoder().decode(exactBody), "12345");

  const oversized = new Request("https://example.test", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("123"));
        controller.enqueue(new TextEncoder().encode("456"));
        controller.close();
      },
    }),
    duplex: "half",
    headers: { "content-length": "2" },
  } as RequestInit);
  assert.equal(await readBoundedBody(oversized, 5), null);

  const declaredOversized = new Request("https://example.test", {
    method: "POST",
    body: "small",
    headers: { "content-length": "100" },
  });
  assert.equal(await readBoundedBody(declaredOversized, 5), null);
});
