import { supabase } from "@/integrations/supabase/client";

import { FORM_SKILLS } from "./progress";
import { reviewState, type ReviewKind, type ReviewState } from "./schedule";
import type { Exercise, LearningItem, Sentence, Skill, Word, WordForm } from "./types";

/** Persisted progress inside a review session (for safe resumption). */
export interface SentenceEntry {
  text: string;
  status: "evaluated" | "skipped" | "failed";
  correct?: boolean;
  feedback?: string;
  corrected?: string | null;
}
export interface SessionState {
  sentences?: Record<string, SentenceEntry>;
}

export interface ReviewSession {
  id: string;
  set_id: string;
  kind: ReviewKind;
  purpose: "initial" | "review";
  status: "active" | "completed";
  phase: "units" | "sentences";
  position: number;
  state: SessionState;
  scheduled_for: string | null;
  started_at: string;
  updated_at: string;
}

export interface ReviewUnit {
  key: string;
  setId: string;
  /** The user's own group name — shared by both units of a set. */
  name: string;
  kind: ReviewKind;
  stage: number;
  nextReviewAt: string | null;
  lastReviewedAt: string | null;
  session: ReviewSession | null;
  /** Every item in the group (not only due ones). */
  total: number;
}

interface SetScheduleRow {
  id: string;
  name: string;
  review_stage: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  forms_review_stage: number;
  forms_last_reviewed_at: string | null;
  forms_next_review_at: string | null;
  forms_generated_at: string | null;
}

/** Every reviewable unit (Original Words + Tenses & Forms per set) with its active session. */
export async function listReviewUnits(deviceId: string): Promise<ReviewUnit[]> {
  const [{ data: sets, error }, { data: sessions }, { data: words }, { data: forms }] =
    await Promise.all([
      supabase
        .from("word_sets")
        .select(
          "id, name, review_stage, last_reviewed_at, next_review_at, forms_review_stage, forms_last_reviewed_at, forms_next_review_at, forms_generated_at",
        )
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false }),
      supabase.from("review_sessions").select("*").eq("device_id", deviceId).eq("status", "active"),
      supabase.from("words").select("id, set_id"),
      supabase.from("word_forms").select("id, set_id, word_id").eq("device_id", deviceId),
    ]);
  if (error) throw error;
  const withWords = new Set((words ?? []).map((w) => w.set_id));
  const wordIds = new Set((words ?? []).map((w) => w.id));
  const validForms = (forms ?? []).filter((f) => wordIds.has(f.word_id));
  const withForms = new Set(validForms.map((f) => f.set_id));
  const countOf = (rows: { set_id: string }[], setId: string) =>
    rows.filter((r) => r.set_id === setId).length;
  const active = (sessions ?? []) as unknown as ReviewSession[];
  const sessionFor = (setId: string, kind: ReviewKind) =>
    active.find((s) => s.set_id === setId && s.kind === kind) ?? null;

  const units: ReviewUnit[] = [];
  for (const set of (sets ?? []) as SetScheduleRow[]) {
    if (withWords.has(set.id)) {
      units.push({
        key: `${set.id}:words`,
        setId: set.id,
        name: set.name,
        kind: "words",
        stage: set.review_stage,
        nextReviewAt: set.next_review_at,
        lastReviewedAt: set.last_reviewed_at,
        session: sessionFor(set.id, "words"),
        total: countOf(words ?? [], set.id),
      });
    }
    if (set.forms_generated_at && withForms.has(set.id)) {
      units.push({
        key: `${set.id}:forms`,
        setId: set.id,
        name: set.name,
        kind: "forms",
        stage: set.forms_review_stage,
        nextReviewAt: set.forms_next_review_at,
        lastReviewedAt: set.forms_last_reviewed_at,
        session: sessionFor(set.id, "forms"),
        total: countOf(validForms, set.id),
      });
    }
  }
  return units;
}

export function unitState(unit: ReviewUnit, now?: Date): ReviewState {
  // Only a scheduled review left unfinished counts as ignored; an unfinished
  // first-time learning run is ordinary training.
  return reviewState(unit.nextReviewAt, unit.session?.purpose === "review", now);
}

/**
 * Opens the session for a unit: resumes the active one, or creates a new one
 * when the unit is unlearned (initial) or its review is due. Otherwise returns
 * null — the run is extra practice and never touches the schedule.
 */
export async function openReviewSession(
  setId: string,
  kind: ReviewKind,
): Promise<ReviewSession | null> {
  const { data: existing } = await supabase
    .from("review_sessions")
    .select("*")
    .eq("set_id", setId)
    .eq("kind", kind)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return existing as unknown as ReviewSession;

  const { data: set, error } = await supabase
    .from("word_sets")
    .select("review_stage, next_review_at, forms_review_stage, forms_next_review_at")
    .eq("id", setId)
    .single();
  if (error) throw error;
  const stage = kind === "words" ? set.review_stage : set.forms_review_stage;
  const next = kind === "words" ? set.next_review_at : set.forms_next_review_at;

  let purpose: "initial" | "review" | null = null;
  if (stage === 0) purpose = "initial";
  else if (next && new Date(next).getTime() <= Date.now()) purpose = "review";
  if (!purpose) return null;

  const { data: created, error: insertError } = await supabase
    .from("review_sessions")
    .insert({ set_id: setId, kind, purpose, scheduled_for: purpose === "review" ? next : null })
    .select("*")
    .single();
  if (insertError) {
    // A parallel tab may have created it first: resume that one instead of duplicating.
    const { data: again } = await supabase
      .from("review_sessions")
      .select("*")
      .eq("set_id", setId)
      .eq("kind", kind)
      .eq("status", "active")
      .maybeSingle();
    if (again) return again as unknown as ReviewSession;
    throw insertError;
  }
  return created as unknown as ReviewSession;
}

export async function saveSessionProgress(
  sessionId: string,
  patch: { phase?: "units" | "sentences"; position?: number; state?: SessionState },
): Promise<void> {
  const { error } = await supabase
    .from("review_sessions")
    .update(patch as never)
    .eq("id", sessionId);
  if (error) throw error;
}

/** Completes the session; the database advances the schedule exactly once. */
export async function completeReviewSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc("complete_review_session", { _session_id: sessionId });
  if (error) throw error;
}

/**
 * Full review sequence for one set: every original word (or every derived form)
 * in its saved order — never shuffled, never a subset, never another set.
 */
export async function buildReviewSequence(setId: string, kind: ReviewKind): Promise<Exercise[]> {
  const [{ data: words }, { data: items }, { data: forms }] = await Promise.all([
    supabase.from("words").select("*").eq("set_id", setId).order("position"),
    supabase.from("learning_items").select("*").eq("set_id", setId),
    kind === "forms"
      ? supabase.from("word_forms").select("*").eq("set_id", setId).order("position")
      : Promise.resolve({ data: [] as WordForm[] }),
  ]);
  const wordList = (words ?? []) as Word[];
  const itemList = (items ?? []) as LearningItem[];
  if (wordList.length === 0) return [];
  const { data: sentences } = await supabase
    .from("sentences")
    .select("*")
    .in("word_id", wordList.map((w) => w.id));
  const sentenceList = (sentences ?? []) as Sentence[];

  const exercises: Exercise[] = [];
  const unitSkills: Skill[] = ["recognition", "speaking", "writing", "recall"];

  if (kind === "words") {
    for (const word of wordList) {
      const wordItems = itemList.filter((i) => i.word_id === word.id && !i.form_id && i.form === "base");
      const sentence =
        sentenceList.find((s) => s.word_id === word.id && s.form === "base" && s.variation_index === 0) ??
        sentenceList.find((s) => s.word_id === word.id) ??
        null;
      for (const skill of unitSkills) {
        const item = wordItems.find((i) => i.skill === skill);
        if (item) exercises.push({ item, word, sentence, skill });
      }
    }
    return exercises;
  }

  const formList = ((forms ?? []) as WordForm[])
    .slice()
    .sort((a, b) => {
      const wa = wordList.findIndex((w) => w.id === a.word_id);
      const wb = wordList.findIndex((w) => w.id === b.word_id);
      return wa - wb || a.position - b.position;
    });
  for (const form of formList) {
    const original = wordList.find((w) => w.id === form.word_id);
    if (!original) continue;
    const formItems = itemList.filter((i) => i.form_id === form.id && FORM_SKILLS.includes(i.skill));
    const sentence = sentenceList.find((s) => s.form === `form:${form.id}`) ?? null;
    const word: Word = {
      ...original,
      id: form.id,
      text: form.text,
      translation: form.translation,
      meaning: form.translation,
      pronunciation: form.pronunciation,
      alternative_parts_of_speech: [],
      explanation: `${form.form_label} · ${original.text}${form.explanation ? ` — ${form.explanation}` : ""}`,
      form_label: form.form_label,
      form_parent: original.text,
      form_explanation: form.explanation,
    };
    for (const item of formItems) exercises.push({ item, word, sentence, skill: item.skill });
  }
  return exercises;
}
