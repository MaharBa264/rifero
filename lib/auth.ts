import { apiError, getSellerSession, type SellerSession } from "@/lib/raffle-db";
import { getSession } from "@/lib/session";

export class AuthRequiredError extends Error {}

/** Resolves the logged-in seller from the session cookie, or throws AuthRequiredError. Use with requireSellerOrError() in a route's catch block. */
export async function requireSeller(request: Request): Promise<SellerSession> {
  const session = await getSession(request, "seller");
  if (!session || session.subjectId == null) throw new AuthRequiredError();
  const seller = await getSellerSession(session.subjectId);
  if (!seller) throw new AuthRequiredError();
  return seller;
}

export async function requireAdminSession(request: Request): Promise<void> {
  const session = await getSession(request, "admin");
  if (!session) throw new AuthRequiredError();
}

export function authErrorResponse() {
  return apiError(new Error("La sesión venció. Volvé a ingresar."), 401);
}
