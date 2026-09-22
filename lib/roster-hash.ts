/**
 * Canonical, reproducible hash of the sold-numbers roster at close time.
 * Sorted numeric ascending, joined by commas, SHA-256 hex. Only the numbers
 * themselves are hashed (not buyer data) so the hash is stable and safe to
 * publish, while still proving the sold set wasn't altered after closing.
 */
export async function computeRosterHash(soldNumbers: number[]): Promise<string> {
  const canonical = [...new Set(soldNumbers)].sort((a, b) => a - b).join(",");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
