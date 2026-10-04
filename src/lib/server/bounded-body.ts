import "server-only";

/** Stop reading as soon as a request exceeds its route's input limit. */
export async function readBoundedBody(request: Request, maxBytes: number) {
  const header = request.headers.get("content-length");
  if (header !== null && (!/^\d+$/.test(header) || Number(header) > maxBytes))
    return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
