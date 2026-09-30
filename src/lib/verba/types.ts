export type Skill =
  | "recognition"
  | "listening"
  | "reading"
  | "writing"
  | "speaking"
  | "recall"
  | "sentence_usage"
  | "form";

export type MasteryState = "new" | "learning" | "familiar" | "strong" | "mastered";

export interface WordSet {
  id: string;
  device_id: string;
  name: string;
  is_demo: boolean;
  last_practiced_at: string | null;
  created_at: string;
  /** Language the sentences in this set are written in. */
  target_language: string;
  /** Language the translations in this set are written in. */
  native_language: string;
}

export interface Word {
  id: string;
  set_id: string;
  text: string;
  /** Meaning in the learner's own language. */
  translation: string | null;
  meaning: string | null;
  pronunciation: string | null;
  part_of_speech: string | null;
  /** Other genuine grammatical uses of the same word. */
  alternative_parts_of_speech?: string[] | null;
  /** 1 (very easy) .. 5 (advanced), from AI analysis. */
  difficulty?: number | null;
  /** Semantic metadata only. */
  tags?: string[] | null;
  position: number;
  /** Only on derived-form units used inside a session: how the form was built. */
  explanation?: string | null;
  /** Derived-form units only: grammatical label, parent word and saved AI explanation. */
  form_label?: string | null;
  form_parent?: string | null;
  form_explanation?: string | null;
}

export interface Sentence {
  id: string;
  word_id: string;
  text: string;
  translation: string | null;
  form: string;
  variation_index: number;
  is_ai_generated: boolean;
  /** Native-chunk -> target-chunk alignment used by the writing hints. */
  word_hints?: { native: string; target: string }[] | null;
}

export interface LearningItem {
  id: string;
  device_id: string;
  set_id: string;
  word_id: string;
  sentence_id: string | null;
  /** Set when this item trains an AI-generated derived form. */
  form_id?: string | null;
  skill: Skill;
  form: string;
  mastery: number;
  state: MasteryState;
  attempts: number;
  mistakes: number;
  streak: number;
  difficulty: number;
  ease: number;
  interval_days: number;
  last_reviewed_at: string | null;
  next_review_at: string;
}

export interface Learner {
  device_id: string;
  display_name: string;
  /** Language being learned. */
  learning_language: string;
  /** Learner's own language — drives the whole interface. */
  native_language: string;
  daily_goal_minutes: number;
  streak: number;
  longest_streak: number;
  notifications_enabled: boolean;
  audio_autoplay: boolean;
  onboarding_completed: boolean;
  /** Storage path of the profile picture in the private avatars bucket. */
  avatar_path?: string | null;
}

export interface DailyProgress {
  id: string;
  device_id: string;
  day: string;
  minutes_practiced: number;
  items_completed: number;
  goal_minutes: number;
}

export interface SetSummary extends WordSet {
  wordCount: number;
  /** Saved Derived Forms whose Original Word still exists. */
  formCount: number;
  /** Real status derived from stored per-word results. */
  status: MasteryState;
}

export interface WordForm {
  id: string;
  device_id: string;
  set_id: string;
  word_id: string;
  text: string;
  form_label: string;
  form_kind: string;
  is_regular: boolean | null;
  translation: string | null;
  explanation: string | null;
  example: string | null;
  example_translation: string | null;
  pronunciation: string | null;
  position: number;
}

/** One step inside a learning session. */
export interface Exercise {
  item: LearningItem;
  word: Word;
  sentence: Sentence | null;
  skill: Skill;
}

/** i18n key for a skill label; resolved through the active dictionary. */
export const SKILL_KEY = {
  recognition: "skill.recognition",
  listening: "skill.listening",
  reading: "skill.reading",
  writing: "skill.writing",
  speaking: "skill.speaking",
  recall: "skill.recall",
  sentence_usage: "skill.sentence_usage",
  form: "skill.form",
} as const;
