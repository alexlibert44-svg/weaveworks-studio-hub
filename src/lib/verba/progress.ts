import type { LearningItem, MasteryState, Skill } from "./types";

/**
 * Real per-unit progress. A unit is an original word (items with no form_id)
 * or one derived form (items sharing a form_id). Word sets have no progress.
 */

/**
 * Skills that make up an original word's or form's progress, equally weighted:
 * Writing, Pronunciation (speaking) and Meaning (recall). Each is scored from
 * a real graded answer; the recognition intro is not graded so it is excluded.
 */
export const UNIT_SKILLS: Skill[] = ["writing", "speaking", "recall"];
export const FORM_SKILLS: Skill[] = UNIT_SKILLS;

/** A skill counts as mastered at this stored mastery value (same threshold as the SRS "mastered" state). */
export const MASTERY_THRESHOLD = 85;

export function wordSkillItems(items: LearningItem[], wordId: string): LearningItem[] {
  return items.filter(
    (i) => i.word_id === wordId && !i.form_id && i.form === "base" && UNIT_SKILLS.includes(i.skill),
  );
}

export function formSkillItems(items: LearningItem[], formId: string): LearningItem[] {
  return items.filter((i) => i.form_id === formId);
}

/** Mean of the required skill values (a missing skill counts as 0). */
export function unitProgress(skillItems: LearningItem[], required: Skill[]): number {
  if (required.length === 0) return 0;
  const sum = required.reduce((acc, skill) => {
    const item = skillItems.find((i) => i.skill === skill);
    return acc + (item ? Number(item.mastery) : 0);
  }, 0);
  return Math.round(sum / required.length);
}

export function unitMastered(skillItems: LearningItem[], required: Skill[]): boolean {
  return required.every((skill) => {
    const item = skillItems.find((i) => i.skill === skill);
    return item ? isSkillMastered(Number(item.mastery), item.streak) : false;
  });
}

export function unitState(skillItems: LearningItem[], required: Skill[]): MasteryState {
  if (skillItems.every((i) => i.attempts === 0)) return "new";
  if (unitMastered(skillItems, required)) return "mastered";
  return "learning";
}

/* --------------------------- attempt-based mastery -------------------------- */

/** One stored graded attempt (practice_attempts row) for a word's skill. */
export interface SkillAttempt {
  learning_item_id: string;
  skill: Skill;
  is_correct: boolean;
  score: number | null;
  response: string | null;
  created_at: string;
}

/** Mastery rule for each required skill, evaluated independently. */
export const MASTERY_RULE = { sessions: 7, penalty: 5 } as const;
const STEP = 100 / MASTERY_RULE.sessions;

const SESSION_PREFIX = /^\[s:([^\]]+)\]\s?/;

/** Tags a stored response with the training session it belongs to. */
export function tagResponse(sessionId: string, response: string | null): string {
  return `[s:${sessionId}] ${response ?? ""}`.trimEnd();
}

/** Session key of an attempt. Older attempts stored before session tagging fall back to their day. */
export function attemptSession(a: Pick<SkillAttempt, "response" | "created_at">): string {
  const m = a.response ? SESSION_PREFIX.exec(a.response) : null;
  return m?.[1] ? m[1] : `day:${a.created_at.slice(0, 10)}`;
}

export function stripSessionTag(response: string | null): string | null {
  return response ? response.replace(SESSION_PREFIX, "") : response;
}

export interface SkillProgress {
  /** Saved progress percentage, 0–100. */
  progress: number;
  /** Consecutive successful sessions since the last mistake. */
  streak: number;
}

/**
 * Replays one skill's stored attempts in order. The first correct answer in a
 * session without an earlier mistake adds one step (100/7, so 14/29/43/57/71/86/100);
 * every wrong answer removes 5 points (never below 0) and resets the streak.
 */
export function replaySkill(attempts: Pick<SkillAttempt, "is_correct" | "response" | "created_at">[]): SkillProgress {
  const ordered = [...attempts].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let value = 0;
  let streak = 0;
  const gained = new Set<string>();
  const errored = new Set<string>();
  for (const a of ordered) {
    const key = attemptSession(a);
    if (!a.is_correct) {
      value = Math.max(0, value - MASTERY_RULE.penalty);
      streak = 0;
      errored.add(key);
    } else if (!gained.has(key) && !errored.has(key)) {
      value = Math.min(100, value + STEP);
      streak += 1;
      gained.add(key);
    }
  }
  return { progress: Math.round(value * 100) / 100, streak };
}

export interface SkillMastery {
  skill: Skill;
  attempts: number;
  successes: number;
  sessions: number;
  progress: number;
  streak: number;
  mastered: boolean;
}

/** A skill is mastered at 100% with seven consecutive error-free successful sessions. */
export function skillMastery(skill: Skill, attempts: SkillAttempt[]): SkillMastery {
  const own = attempts.filter((a) => a.skill === skill);
  const { progress, streak } = replaySkill(own);
  return {
    skill,
    attempts: own.length,
    successes: own.filter((a) => a.is_correct).length,
    sessions: new Set(own.map(attemptSession)).size,
    progress,
    streak,
    mastered: isSkillMastered(progress, streak),
  };
}

export function isSkillMastered(progress: number, streak: number): boolean {
  return Math.round(progress) >= 100 && streak >= MASTERY_RULE.sessions;
}

/** Displayed progress is exactly the saved value. */
export function displayProgress(value: number, _mastered?: boolean): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** New = no graded attempt in any required skill; Mastered = every required skill meets the rule. */
export function wordStatus(attempts: SkillAttempt[], required: Skill[] = UNIT_SKILLS): MasteryState {
  const relevant = attempts.filter((a) => required.includes(a.skill));
  if (relevant.length === 0) return "new";
  return required.every((s) => skillMastery(s, relevant).mastered) ? "mastered" : "learning";
}
