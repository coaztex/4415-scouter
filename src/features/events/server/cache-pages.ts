import "server-only";

/** Read the complete cached schedule despite PostgREST's per-request row cap. */
export async function readEventCachePages<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let from = 0; from < 20000; from += 500) {
    const result = await read(from, from + 499);
    if (result.error || !result.data)
      throw new Error("Event schedule cache unavailable.");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
  throw new Error("Event schedule exceeds supported size.");
}
