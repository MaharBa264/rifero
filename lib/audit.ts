import type { D1Database } from "@cloudflare/workers-types";

const SENSITIVE_KEYS = new Set(["new_admin_pin", "pin", "newPin", "new_recovery_code", "recovery_code", "code", "token", "password"]);

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, SENSITIVE_KEYS.has(key) ? "[oculto]" : redact(v)]));
  }
  return value;
}

export type AuditEntry = {
  action: string;
  actorLabel: string;
  actorType?: "admin" | "seller" | "system" | "public";
  actorId?: string | number | null;
  entityType?: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
  requestId?: string;
  /** Legacy free-form payload column, kept for backward compatibility with existing readers. */
  payload?: unknown;
};

/** Writes one audit row. Never pass PINs/tokens in `payload`/`before`/`after` — redact() strips known key names but isn't a substitute for care at the call site. */
export async function logAudit(db: D1Database, entry: AuditEntry) {
  const now = new Date().toISOString();
  const payload = redact(entry.payload ?? { before: entry.before, after: entry.after });
  await db.prepare(
    "INSERT INTO audit_log (action,actor,payload,actor_type,actor_id,entity_type,entity_id,before_json,after_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(
    entry.action,
    entry.actorLabel,
    JSON.stringify(payload),
    entry.actorType ?? null,
    entry.actorId != null ? String(entry.actorId) : null,
    entry.entityType ?? null,
    entry.entityId != null ? String(entry.entityId) : null,
    entry.before !== undefined ? JSON.stringify(redact(entry.before)) : null,
    entry.after !== undefined ? JSON.stringify(redact(entry.after)) : null,
    entry.requestId ?? null,
    now,
  ).run();
}
