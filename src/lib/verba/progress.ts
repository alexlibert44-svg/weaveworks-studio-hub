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
