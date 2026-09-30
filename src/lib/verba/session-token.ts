import { supabase } from "@/integrations/supabase/client";

/**
 * Shared sign-in token handling for the browser.
 *
 * Every authenticated call (server functions, the audio endpoint, direct
 * database reads) goes through here so an expired token is renewed before the
 * request instead of failing with "Unauthorized: Invalid token". When renewal
 * is impossible the user is signed out cleanly and sent to the sign-in page,
 * never left on a crashed screen.
 */

/** Thrown when the saved sign-in can no longer be renewed. */
export class AuthExpiredError extends Error {
  constructor() {
    super("session-expired");
    this.name = "AuthExpiredError";
  }
}

const SKEW_MS = 60_000;

let refreshing: Promise<string | null> | null = null;

function looksLikeJwt(token: string | undefined | null): token is string {
  return typeof token === "string" && token.split(".").length === 3;
}

async function refreshOnce(): Promise<string | null> {
  refreshing ??= supabase.auth
    .refreshSession()
    .then(({ data, error }) => (error ? null : (data.session?.access_token ?? null)))
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Returns a usable access token, renewing it first when it is missing,
 * malformed or about to expire. Returns null when the user is signed out.
 */
export async function getFreshAccessToken(force = false): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession().catch(() => ({ data: { session: null }, error: true }));
  const session = error ? null : data.session;
  const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
  const stale = !looksLikeJwt(session?.access_token) || expiresAt - Date.now() < SKEW_MS;
  if (!force && !stale) return session!.access_token;
  if (!session && !force) return null;
  const renewed = await refreshOnce();
  if (looksLikeJwt(renewed)) return renewed;
  return looksLikeJwt(session?.access_token) && !stale ? session!.access_token : null;
}

/** True when an error means the request was rejected for an invalid/expired sign-in. */
export function isAuthFailure(error: unknown): boolean {
  if (error instanceof AuthExpiredError) return true;
  const status = (error as { status?: number; statusCode?: number } | null)?.status ??
    (error as { statusCode?: number } | null)?.statusCode;
  if (status === 401) return true;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /unauthorized|invalid token|jwt expired|token is expired|invalid claim|no authorization header|signed-out|session-expired|audio-401/i.test(
    message,
  );
}

/**
 * Last resort after an authentication failure: try to renew once, and if that
 * fails sign out so the app shows the sign-in page instead of a broken screen.
 * Returns true when the session was recovered.
 */
export async function recoverSession(): Promise<boolean> {
  const token = await getFreshAccessToken(true);
  if (token) return true;
  await supabase.auth.signOut().catch(() => undefined);
  return false;
}

/**
 * Handles an error from any authenticated call. Returns true when it was a
 * sign-in problem that couldn't be recovered, so the caller can show a
 * "please sign in again" message instead of a raw error.
 */
export async function handleAuthFailure(error: unknown): Promise<boolean> {
  if (!isAuthFailure(error)) return false;
  const recovered = await recoverSession();
  return !recovered;
}
