// Stands in for the `cloudflare:workers` module (only available inside an
// actual Worker) so route/lib code can run under plain Node + vitest.
// Tests assign `env.DB` (and any other bindings/secrets they need) directly.
export const env: Record<string, unknown> = {};
