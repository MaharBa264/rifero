import { apiError } from "@/lib/raffle-db";
import { revokeSession } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const cookie = await revokeSession(request, "seller");
    const response = Response.json({ ok: true });
    response.headers.set("set-cookie", cookie);
    return response;
  } catch (error) { return apiError(error); }
}
