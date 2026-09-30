/**
 * Single source of truth for Word Set–level review status.
 *
 * Scheduling itself (stage advance, next date) happens only in the database
 * function `complete_review_session`, so it can never be advanced twice or by
 * the client. This module only *reads* those persistent timestamps and derives
 * a status. Home, Review and Word Set pages all call `reviewState`.
 */

export type ReviewKind = "words" | "forms";
export type ReviewState = "unscheduled" | "upcoming" | "due" | "overdue" | "ignored";

/** Days until the next review after entering a stage. Mirrors `review_interval_days` in SQL. */
export const REVIEW_INTERVALS: Record<number, number> = { 1: 3, 2: 7, 3: 14, 4: 30, 5: 60, 6: 120 };
export const REVIEW_INTERVAL_AFTER_LAST = 180;

export function intervalForStage(stage: number): number {
  return REVIEW_INTERVALS[Math.max(1, stage)] ?? REVIEW_INTERVAL_AFTER_LAST;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * - ignored: a review session was started and left unfinished (resumable)
 * - unscheduled: initial learning not completed yet — no real date exists
 * - upcoming: the scheduled timestamp is in the future
 * - due: the timestamp has arrived today (local calendar day)
 * - overdue: the timestamp fell on an earlier local day
 */
export function reviewState(
  nextReviewAt: string | null,
  hasActiveSession: boolean,
  now: Date = new Date(),
): ReviewState {
  if (hasActiveSession) return "ignored";
  if (!nextReviewAt) return "unscheduled";
  const next = new Date(nextReviewAt);
  if (next.getTime() > now.getTime()) return "upcoming";
  return localDayKey(next) === localDayKey(now) ? "due" : "overdue";
}

/** Human countdown from the real timestamp, in the interface language. */
export function countdown(nextReviewAt: string, locale: string, now: Date = new Date()): string {
  const diff = new Date(nextReviewAt).getTime() - now.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(Math.max(minutes, 1), "minute");
  const hours = Math.round(diff / 3600000);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(diff / 86400000);
  return rtf.format(days, "day");
}
