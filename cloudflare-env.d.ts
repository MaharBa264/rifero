declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TURNSTILE_SECRET_KEY?: string;
  }
}
