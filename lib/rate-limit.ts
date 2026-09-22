import { getD1 } from "@/lib/raffle-db";

// Progressive backoff purely from recent failures recorded in `login_attempts`.
// Never stores the PIN/password itself — only identity, ip, success and time.
const WINDOW_MINUTES = 15;
const STEPS: Array<{ failures: number; lockSeconds: number }> = [
  { failures: 5, lockSeconds: 30 },
  { failures: 8, lockSeconds: 120 },
  { failures: 12, lockSeconds: 600 },
  { failures: 20, lockSeconds: 1800 },
];

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

export async function checkRateLimit(identity: string, ip: string): Promise<RateLimitResult> {
  const db = getD1();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
  const [byIdentity, byIp] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS total, MAX(created_at) AS last FROM login_attempts WHERE identity=? AND success=0 AND created_at>?").bind(identity, since).first<{ total: number; last: string | null }>(),
    db.prepare("SELECT COUNT(*) AS total, MAX(created_at) AS last FROM login_attempts WHERE ip=? AND success=0 AND created_at>?").bind(ip, since).first<{ total: number; last: string | null }>(),
  ]);
  const failures = Math.max(byIdentity?.total ?? 0, byIp?.total ?? 0);
  const lastFailure = [byIdentity?.last, byIp?.last].filter(Boolean).sort().pop();
  let lockSeconds = 0;
  for (const step of STEPS) if (failures >= step.failures) lockSeconds = step.lockSeconds;
  if (!lockSeconds || !lastFailure) return { allowed: true, retryAfterSeconds: 0 };
  const elapsed = (Date.now() - new Date(lastFailure).getTime()) / 1000;
  const remaining = Math.ceil(lockSeconds - elapsed);
  return remaining > 0 ? { allowed: false, retryAfterSeconds: remaining } : { allowed: true, retryAfterSeconds: 0 };
}

export async function recordAttempt(identity: string, ip: string, success: boolean) {
  await getD1().prepare("INSERT INTO login_attempts (identity,ip,success,created_at) VALUES (?,?,?,?)")
    .bind(identity, ip, success ? 1 : 0, new Date().toISOString()).run();
}

/** Best-effort cleanup so the table doesn't grow unbounded; call opportunistically, never awaited on the hot path. */
export async function pruneOldAttempts() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await getD1().prepare("DELETE FROM login_attempts WHERE created_at<?").bind(cutoff).run();
}
