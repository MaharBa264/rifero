import { getD1 } from "@/lib/raffle-db";

/**
 * Runs `fn` at most once per (scope, key). A repeated call with the same
 * Idempotency-Key header replays the stored response instead of
 * re-executing — protects against double-taps / retried requests duplicating
 * a sale. `key` is optional: callers without an Idempotency-Key header just
 * run `fn` normally (no dedup, same as before).
 */
export async function withIdempotency(scope: string, key: string | null, fn: () => Promise<Response>): Promise<Response> {
  if (!key) return fn();
  const db = getD1();
  const idKey = `${scope}:${key}`;
  const existing = await db.prepare("SELECT status_code,response_json FROM idempotency_keys WHERE id_key=?").bind(idKey).first<{ status_code: number; response_json: string }>();
  if (existing) return new Response(existing.response_json, { status: existing.status_code, headers: { "content-type": "application/json" } });
  const response = await fn();
  const cloned = response.clone();
  if (response.status < 500) {
    const text = await cloned.text();
    await db.prepare("INSERT OR IGNORE INTO idempotency_keys (id_key,scope,status_code,response_json,created_at) VALUES (?,?,?,?,?)")
      .bind(idKey, scope, response.status, text, new Date().toISOString()).run();
  }
  return response;
}
