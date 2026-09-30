import { createMiddleware } from "@tanstack/react-start";

import { getFreshAccessToken } from "@/lib/verba/session-token";

/**
 * Attaches the signed-in user's token to every server call, renewing it first
 * when it has expired. Replaces the generated attacher, which sent whatever
 * token was in storage and so produced "Unauthorized: Invalid token".
 */
export const attachFreshSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = await getFreshAccessToken();
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
