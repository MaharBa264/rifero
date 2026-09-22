import { apiError, getPublicData } from "@/lib/raffle-db";

export async function GET() {
  try { return Response.json(await getPublicData()); }
  catch (error) { return apiError(error); }
}
