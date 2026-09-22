import { getD1 } from "@/lib/raffle-db";
import { newRequestId } from "@/lib/observability";

export async function GET() {
  const requestId = newRequestId();
  const startedAt = Date.now();
  let dbOk = false;
  try {
    await getD1().prepare("SELECT 1 AS ok").first();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const body = { ok: dbOk, dbOk, time: new Date().toISOString(), latencyMs: Date.now() - startedAt };
  const response = Response.json(body, { status: dbOk ? 200 : 503 });
  response.headers.set("x-request-id", requestId);
  return response;
}
