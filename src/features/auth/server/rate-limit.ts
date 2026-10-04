import "server-only";
import { createHash } from "node:crypto";

// Best-effort per-process burst protection, in addition to Supabase Auth limits.
// Vercel Firewall must enforce a deployment-wide limit; memory is not shared.
const buckets = new Map<string, { count: number; expires: number }>();
export function allowLoginAttempt(address: string, now = Date.now()) {
  for (const [key, bucket] of buckets)
    if (bucket.expires <= now) buckets.delete(key);
  const key = createHash("sha256").update(address).digest("hex");
  const bucket = buckets.get(key);
  if (bucket) {
    bucket.count++;
    return bucket.count <= 10;
  }
  if (buckets.size >= 5000) return false;
  buckets.set(key, { count: 1, expires: now + 60_000 });
  return true;
}
