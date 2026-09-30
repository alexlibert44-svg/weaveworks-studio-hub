/**
 * Anonymous device identity. Login is not part of this MVP, so every learner
 * is keyed by a stable per-device id. When accounts are added, this is the one
 * place that changes: return the authenticated user id instead.
 */
const KEY = "verba.device-id";

export function readDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = `dev_${crypto.randomUUID()}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}
