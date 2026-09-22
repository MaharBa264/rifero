import { apiError, getPublicData } from "@/lib/raffle-db";
import { newRequestId } from "@/lib/observability";

export async function GET() {
  const requestId = newRequestId();
  try {
    const response = Response.json(await getPublicData());
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) { return apiError(error); }
}
