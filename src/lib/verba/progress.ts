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
    return item ? Number(item.mastery) >= MASTERY_THRESHOLD : false;
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
export const MASTERY_RULE = { successes: 5, latest: 5, sessions: 3 } as const;

const SESSION_PREFIX = /^\[s:([^\]]+)\]\s?/;

/** Tags a stored response with the training session it belongs to. */
export function tagResponse(sessionId: string, response: string | null): string {
  return `[s:${sessionId}] ${response ?? ""}`.trimEnd();
}

/** Session key of an attempt. Older attempts stored before session tagging fall back to their day. */
export function attemptSession(a: SkillAttempt): string {
  const m = a.response ? SESSION_PREFIX.exec(a.response) : null;
  return m ? m[1] : `day:${a.created_at.slice(0, 10)}`;
}

export function stripSessionTag(response: string | null): string | null {
  return response ? response.replace(SESSION_PREFIX, "") : response;
}

export interface SkillMastery {
  skill: Skill;
  attempts: number;
  successes: number;
  sessions: number;
  mastered: boolean;
}

/** Applies the exact mastery rule to one skill's stored attempt history. */
export function skillMastery(skill: Skill, attempts: SkillAttempt[]): SkillMastery {
  const own = attempts
    .filter((a) => a.skill === skill)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const successes = own.filter((a) => a.is_correct).length;
  const latest = own.slice(0, MASTERY_RULE.latest);
  const latestSessions = new Set(latest.map(attemptSession)).size;
  const mastered =
    successes >= MASTERY_RULE.successes &&
    latest.length === MASTERY_RULE.latest &&
    latest.every((a) => a.is_correct) &&
    latestSessions >= MASTERY_RULE.sessions;
  return {
    skill,
    attempts: own.length,
    successes,
    sessions: new Set(own.map(attemptSession)).size,
    mastered,
  };
}

/** New = no graded attempt in any required skill; Mastered = every required skill meets the rule. */
export function wordStatus(attempts: SkillAttempt[], required: Skill[] = UNIT_SKILLS): MasteryState {
  const relevant = attempts.filter((a) => required.includes(a.skill));
  if (relevant.length === 0) return "new";
  return required.every((s) => skillMastery(s, relevant).mastered) ? "mastered" : "learning";
}
