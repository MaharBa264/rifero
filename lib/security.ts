// Password/PIN hashing with a progressive migration path.
//
// Legacy format: a bare 64-char hex string (raw SHA-256 of the PIN, no salt).
// New format:    `pbkdf2$<iterations>$<saltHex>$<hashHex>` (PBKDF2-HMAC-SHA256,
//                 random 16-byte salt, Web Crypto — supported in Workers).
//
// verifyPin() accepts either format so existing hashes keep working, and
// tells the caller to rehash on a successful legacy match so the row is
// upgraded transparently on the user's next login.

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_PREFIX = "pbkdf2";
const LEGACY_SHA256 = /^[0-9a-f]{64}$/;

function toHex(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

async function pbkdf2(value: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, key, 256);
  return toHex(bits);
}

/** Hash a PIN/password with the current (non-legacy) scheme. */
export async function hashSecret(value: string, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(value, salt, iterations);
  return `${PBKDF2_PREFIX}$${iterations}$${toHex(salt)}$${hash}`;
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type VerifyResult = { ok: boolean; needsRehash: boolean };

/** Verify a PIN/password against a stored hash of either format. */
export async function verifySecret(value: string, stored: string): Promise<VerifyResult> {
  if (!stored) return { ok: false, needsRehash: false };
  if (stored.startsWith(`${PBKDF2_PREFIX}$`)) {
    const [, iterationsRaw, saltHex, hashHex] = stored.split("$");
    const iterations = Number(iterationsRaw);
    if (!iterations || !saltHex || !hashHex) return { ok: false, needsRehash: false };
    const computed = await pbkdf2(value, fromHex(saltHex), iterations);
    const ok = timingSafeEqual(computed, hashHex);
    return { ok, needsRehash: ok && iterations < PBKDF2_ITERATIONS };
  }
  if (LEGACY_SHA256.test(stored)) {
    const computed = await sha256(value);
    const ok = timingSafeEqual(computed, stored);
    return { ok, needsRehash: ok };
  }
  return { ok: false, needsRehash: false };
}

export function randomToken(bytes = 32) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}
