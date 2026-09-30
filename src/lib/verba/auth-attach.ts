import { createMiddleware } from "@tanstack/react-start";

import { getFreshAccessToken } from "@/lib/verba/session-token";

/**
 * Attaches the signed-in user's token to every server call, renewing it first
 * when it has expired. Replaces the generated attacher, which sent whatever
 * token was in storage and so produced "Unauthorized: Invalid token".
 */
export const attachFreshSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  // During SSR this runs on the server, where there is no stored session.
  if (typeof window === "undefined") return next();
  const token = await getFreshAccessToken().catch(() => null);
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
