import type { LearningItem, MasteryState } from "./types";

/**
 * Spaced-repetition scheduler (SM-2 derivative).
 *
 * This is the single place where scheduling is decided, so a different
 * algorithm (FSRS, server-side model, ...) can be swapped in without
 * touching any UI code. `score` is a real 0..1 performance value coming
 * from an actual user answer — never random.
 */

/** Interval ladder in days, indexed by the item's success streak. */
const INTERVALS = [0, 1, 2, 4, 8, 16, 35, 70];

export interface ScheduleUpdate {
  mastery: number;
  state: MasteryState;
  attempts: number;
  mistakes: number;
  streak: number;
  difficulty: number;
  ease: number;
  interval_days: number;
  last_reviewed_at: string;
  next_review_at: string;
}

export function masteryState(mastery: number): MasteryState {
  if (mastery <= 0) return "new";
  if (mastery < 35) return "learning";
  if (mastery < 60) return "familiar";
  if (mastery < 85) return "strong";
  return "mastered";
}

export function masteryLabel(mastery: number): string {
  const state = masteryState(mastery);
  return {
    new: "New",
    learning: "Learning",
    familiar: "Familiar",
    strong: "Strong",
    mastered: "Mastered",
  }[state];
}

/** Returns the fields to persist after one real attempt. */
export function schedule(item: LearningItem, score: number): ScheduleUpdate {
  const passed = score >= 0.6;
  const now = new Date();

  const streak = passed ? item.streak + 1 : 0;
  const ease = clamp(passed ? item.ease + (score - 0.7) * 0.3 : item.ease - 0.2, 1.3, 3.2);
  const difficulty = clamp(passed ? item.difficulty - 0.05 : item.difficulty + 0.1, 0.05, 1);

  // Mastery moves gradually, so a single correct answer never "masters" an item.
  const target = passed ? 100 : 0;
  const weight = passed ? 0.22 * (0.6 + score * 0.4) : 0.3;
  const mastery = clamp(item.mastery + (target - item.mastery) * weight, 0, 100);

  const base = INTERVALS[Math.min(streak, INTERVALS.length - 1)] ?? 1;
  const intervalDays = passed ? round2(base * (ease / 2.5)) : 0;

  const next = new Date(now);
  if (intervalDays === 0) {
    // Failed items come back inside the same session block.
    next.setMinutes(next.getMinutes() + 10);
  } else {
    next.setTime(next.getTime() + intervalDays * 86400000);
  }

  return {
    mastery: round2(mastery),
    state: masteryState(mastery),
    attempts: item.attempts + 1,
    mistakes: item.mistakes + (passed ? 0 : 1),
    streak,
    difficulty: round2(difficulty),
    ease: round2(ease),
    interval_days: intervalDays,
    last_reviewed_at: now.toISOString(),
    next_review_at: next.toISOString(),
  };
}

/**
 * Review priority: weakest + most overdue first. The review engine uses this
 * so a learner who keeps misspelling a word gets writing drills, and a learner
 * with weak pronunciation gets speaking drills.
 */
export function priority(item: LearningItem, now = Date.now()): number {
  const overdueDays = (now - new Date(item.next_review_at).getTime()) / 86400000;
  const errorRate = item.attempts > 0 ? item.mistakes / item.attempts : 0.5;
  return (100 - item.mastery) * 0.6 + Math.max(overdueDays, 0) * 8 + errorRate * 40;
}

export function isDue(item: LearningItem, now = Date.now()): boolean {
  return new Date(item.next_review_at).getTime() <= now;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Normalised text comparison used by writing + speaking checks. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 0..1 similarity, used to score spoken/typed sentences. */
export function similarity(a: string, b: string): number {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const distance = levenshtein(x, y);
  return Math.max(0, 1 - distance / Math.max(x.length, y.length));
}

function levenshtein(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0] as number;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j] as number;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min((prev[j] as number) + 1, (prev[j - 1] as number) + 1, last + cost);
      last = temp;
    }
  }
  return prev[b.length] as number;
}
