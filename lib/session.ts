import { getD1 } from "@/lib/raffle-db";
import { randomToken, sha256 } from "@/lib/security";

export type SubjectType = "admin" | "seller";

const COOKIE_NAMES: Record<SubjectType, string> = { admin: "rifa_admin_session", seller: "rifa_seller_session" };
const SESSION_LIFETIME_MS: Record<SubjectType, number> = {
  admin: 12 * 60 * 60 * 1000, // 12h — admins re-authenticate more often.
  seller: 14 * 24 * 60 * 60 * 1000, // 14 days, sliding — families sell over weeks.
};

function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === "https:";
}

function buildCookie(name: string, value: string, request: Request, maxAgeSeconds: number) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
  if (isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name: string, request: Request) {
  const parts = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function createSession(subjectType: SubjectType, subjectId: number | null, request: Request) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_LIFETIME_MS[subjectType]);
  await getD1().prepare("INSERT INTO sessions (token_hash,subject_type,subject_id,created_at,expires_at,last_seen_at,user_agent,ip) VALUES (?,?,?,?,?,?,?,?)")
    .bind(tokenHash, subjectType, subjectId, now.toISOString(), expires.toISOString(), now.toISOString(), request.headers.get("user-agent")?.slice(0, 200) ?? null, clientIp(request)).run();
  const cookie = buildCookie(COOKIE_NAMES[subjectType], token, request, SESSION_LIFETIME_MS[subjectType] / 1000);
  return { token, cookie };
}

export function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export type SessionRow = { token_hash: string; subject_type: SubjectType; subject_id: number | null; expires_at: string; revoked_at: string | null };

/** Reads the session cookie, validates it, and slides the expiry forward on seller sessions. */
export async function getSession(request: Request, subjectType: SubjectType) {
  const token = readCookie(request, COOKIE_NAMES[subjectType]);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const db = getD1();
  const row = await db.prepare("SELECT * FROM sessions WHERE token_hash=?").bind(tokenHash).first<SessionRow>();
  if (!row || row.revoked_at || row.subject_type !== subjectType) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_LIFETIME_MS[subjectType]);
  await db.prepare("UPDATE sessions SET last_seen_at=?,expires_at=? WHERE token_hash=?").bind(now.toISOString(), expires.toISOString(), tokenHash).run();
  return { subjectId: row.subject_id, tokenHash };
}

export async function revokeSession(request: Request, subjectType: SubjectType) {
  const token = readCookie(request, COOKIE_NAMES[subjectType]);
  if (token) {
    const tokenHash = await sha256(token);
    await getD1().prepare("UPDATE sessions SET revoked_at=? WHERE token_hash=?").bind(new Date().toISOString(), tokenHash).run();
  }
  return clearCookie(COOKIE_NAMES[subjectType], request);
}

/** Revokes every other active session for the same subject — used when a PIN/password changes. */
export async function revokeAllSessionsFor(subjectType: SubjectType, subjectId: number | null) {
  await getD1().prepare("UPDATE sessions SET revoked_at=? WHERE subject_type=? AND subject_id IS ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), subjectType, subjectId).run();
}
