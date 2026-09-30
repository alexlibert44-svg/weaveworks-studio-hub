import { supabase } from "@/integrations/supabase/client";

import { generateSetContent } from "./generation.functions";
import { generateForms } from "./forms.functions";
import {
  FORM_SKILLS,
  UNIT_SKILLS,
  unitMastered,
  wordSkillItems,
} from "./progress";
import { isDue, priority, schedule } from "./srs";
import type {
  DailyProgress,
  Exercise,
  Learner,
  LearningItem,
  Sentence,
  SetSummary,
  Skill,
  Word,
  WordForm,
  WordSet,
} from "./types";

/** Skills drilled for a freshly created word, in learning order. */
const CORE_SKILLS: Skill[] = ["recognition", "writing", "speaking", "recall"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ---------------------------------- learner --------------------------------- */

export async function ensureLearner(deviceId: string): Promise<Learner> {
  const { data } = await supabase
    .from("learners")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (data) return data as Learner;

  const { data: created, error } = await supabase
    .from("learners")
    .insert({ device_id: deviceId })
    .select("*")
    .single();
  if (error) throw error;
  return created as Learner;
}

export async function updateLearner(
  deviceId: string,
  patch: Partial<Omit<Learner, "device_id">>,
): Promise<Learner> {
  const { data, error } = await supabase
    .from("learners")
    .update(patch)
    .eq("device_id", deviceId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Learner;
}

/* ---------------------------------- sets ----------------------------------- */

export async function listSets(deviceId: string): Promise<SetSummary[]> {
  const [{ data: sets, error }, { data: words }, { data: items }] = await Promise.all([
    supabase
      .from("word_sets")
      .select("*")
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false }),
    supabase.from("words").select("id, set_id"),
    supabase.from("learning_items").select("*").eq("device_id", deviceId),
  ]);
  if (error) throw error;

  const now = Date.now();
  return (sets ?? []).map((set) => {
    const setWords = (words ?? []).filter((w) => w.set_id === set.id);
    const setItems = ((items ?? []) as LearningItem[]).filter((i) => i.set_id === set.id);
    const dueCount = setItems.filter((i) => new Date(i.next_review_at).getTime() <= now).length;
    const wordUnits = setWords.map((w) => wordSkillItems(setItems, w.id));
    const status: SetSummary["status"] =
      setItems.every((i) => i.attempts === 0)
        ? "new"
        : wordUnits.length > 0 && wordUnits.every((u) => unitMastered(u, UNIT_SKILLS))
          ? "mastered"
          : "learning";
    return { ...(set as WordSet), wordCount: setWords.length, status, dueCount };
  });
}

export async function getSet(setId: string): Promise<{
  set: WordSet;
  words: Word[];
  items: LearningItem[];
  forms: WordForm[];
  formsGenerated: boolean;
}> {
  const [{ data: set, error }, { data: words }, { data: items }, { data: forms }] =
    await Promise.all([
      supabase.from("word_sets").select("*").eq("id", setId).single(),
      supabase.from("words").select("*").eq("set_id", setId).order("position"),
      supabase.from("learning_items").select("*").eq("set_id", setId),
      supabase.from("word_forms").select("*").eq("set_id", setId).order("position"),
    ]);
  if (error) throw error;
  return {
    set: set as WordSet,
    words: (words ?? []) as Word[],
    items: (items ?? []) as LearningItem[],
    forms: (forms ?? []) as WordForm[],
    formsGenerated: Boolean((set as { forms_generated_at?: string | null }).forms_generated_at),
  };
}

/** Runs only when the learner asks: AI analyses the set's words and stores real forms. */
export async function createForms(input: {
  deviceId: string;
  setId: string;
  targetLanguageName: string;
  nativeLanguageName: string;
}): Promise<void> {
  const { words } = await getSet(input.setId);
  if (words.length === 0) return;
  const generated = await generateForms({
    data: {
      words: words.map((w) => ({ id: w.id, text: w.text, part_of_speech: w.part_of_speech })),
      targetLanguage: input.targetLanguageName,
      nativeLanguage: input.nativeLanguageName,
    },
  });

  // Replace any earlier generation for this set.
  await supabase.from("word_forms").delete().eq("set_id", input.setId);

  const rows = generated.flatMap((g) =>
    g.forms.map((f, index) => ({
      device_id: input.deviceId,
      set_id: input.setId,
      word_id: g.word_id,
      text: f.text,
      form_label: f.form_label,
      form_kind: f.form_kind,
      is_regular: f.is_regular,
      translation: f.translation || null,
      explanation: f.explanation || null,
      example: f.example,
      example_translation: f.example_translation || null,
      pronunciation: f.pronunciation || null,
      position: index,
    })),
  );
  for (const g of generated) {
    if (g.category && g.forms.length > 0) {
      await supabase.from("words").update({ forms_category: g.category }).eq("id", g.word_id);
    }
  }

  if (rows.length > 0) {
    const { data: forms, error } = await supabase.from("word_forms").insert(rows).select("*");
    if (error) throw error;

    for (const form of (forms ?? []) as WordForm[]) {
      const key = `form:${form.id}`;
      const { data: sentence, error: sError } = await supabase
        .from("sentences")
        .insert({
          word_id: form.word_id,
          text: form.example ?? form.text,
          translation: form.example_translation,
          form: key,
          variation_index: 0,
          is_ai_generated: true,
        })
        .select("id")
        .single();
      if (sError) throw sError;
      const { error: iError } = await supabase.from("learning_items").insert(
        FORM_SKILLS.map((skill) => ({
          device_id: input.deviceId,
          set_id: input.setId,
          word_id: form.word_id,
          form_id: form.id,
          sentence_id: sentence.id,
          skill,
          form: key,
          next_review_at: new Date().toISOString(),
        })),
      );
      if (iError) throw iError;
    }
  }

  const { error: uError } = await supabase
    .from("word_sets")
    .update({ forms_generated_at: new Date().toISOString() })
    .eq("id", input.setId);
  if (uError) throw uError;
}

export async function getForm(formId: string): Promise<{
  form: WordForm;
  word: Word;
  set: WordSet;
  items: LearningItem[];
}> {
  const { data: form, error } = await supabase
    .from("word_forms")
    .select("*")
    .eq("id", formId)
    .single();
  if (error) throw error;
  const [{ data: word }, { data: set }, { data: items }] = await Promise.all([
    supabase.from("words").select("*").eq("id", form.word_id).single(),
    supabase.from("word_sets").select("*").eq("id", form.set_id).single(),
    supabase.from("learning_items").select("*").eq("form_id", formId),
  ]);
  return {
    form: form as WordForm,
    word: word as Word,
    set: set as WordSet,
    items: (items ?? []) as LearningItem[],
  };
}

export interface CreateSetInput {
  deviceId: string;
  name: string;
  words: string[];
  /** Language code of the language being learned. */
  targetLanguage: string;
  /** Language code of the learner's own language. */
  nativeLanguage: string;
  /** English names, used for the AI prompt. */
  targetLanguageName: string;
  nativeLanguageName: string;
}

export async function createSet(input: CreateSetInput): Promise<string> {
  if (input.words.length < 4) throw new Error("A set needs at least 4 words.");
  await ensureLearner(input.deviceId);

  // Generate first: a set is never stored without real lesson content.
  const generated = await generateSetContent({
    data: {
      words: input.words,
      targetLanguage: input.targetLanguageName,
      nativeLanguage: input.nativeLanguageName,
    },
  });

  const { data: set, error } = await supabase
    .from("word_sets")
    .insert({
      device_id: input.deviceId,
      name: input.name,
      target_language: input.targetLanguage,
      native_language: input.nativeLanguage,
    })
    .select("*")
    .single();
  if (error) throw error;

  await storeGenerated(input.deviceId, set.id as string, generated);
  return set.id as string;
}

type Generated = Awaited<ReturnType<typeof generateSetContent>>;

/** Persists AI content as words + sentences + trackable learning items. */
async function storeGenerated(deviceId: string, setId: string, generated: Generated) {
  const { data: words, error: wordError } = await supabase
    .from("words")
    .insert(
      generated.map((g, index) => ({
        set_id: setId,
        text: g.target_word,
        translation: g.translation,
        meaning: g.translation,
        pronunciation: g.pronunciation || null,
        part_of_speech: g.part_of_speech || null,
        alternative_parts_of_speech: g.alternative_parts_of_speech ?? [],
        difficulty: g.difficulty ?? null,
        tags: g.tags ?? [],
        position: index,
      })),
    )
    .select("*");
  if (wordError) throw wordError;

  const sentenceRows = (words ?? []).flatMap((word) => {
    const content = generated.find((g) => g.target_word === word.text);
    return (content?.sentences ?? []).map((s) => ({
      word_id: word.id,
      text: s.text,
      translation: s.translation,
      form: s.form,
      variation_index: s.variation_index,
      is_ai_generated: true,
      word_hints: s.word_hints ?? [],
    }));
  });

  const { data: sentences, error: sentenceError } = await supabase
    .from("sentences")
    .insert(sentenceRows)
    .select("*");
  if (sentenceError) throw sentenceError;

  const itemRows = (words ?? []).flatMap((word) => {
    const wordSentences = (sentences ?? []).filter((s) => s.word_id === word.id);
    const base = wordSentences.find((s) => s.form === "base" && s.variation_index === 0);
    const core = CORE_SKILLS.map((skill) => ({
      device_id: deviceId,
      set_id: setId,
      word_id: word.id,
      sentence_id: base?.id ?? null,
      skill,
      form: "base",
      next_review_at: new Date().toISOString(),
    }));

    // Context variations and grammatical forms are introduced gradually.
    // Grammatical forms are created only on request (Tenses & Forms tab).
    const extras = wordSentences
      .filter((s) => s.form === "base" && s.variation_index !== 0)
      .map((s, index) => ({
        device_id: deviceId,
        set_id: setId,
        word_id: word.id,
        sentence_id: s.id,
        skill: "sentence_usage" as Skill,
        form: s.form,
        next_review_at: new Date(Date.now() + (index + 2) * 86400000).toISOString(),
      }));

    return [...core, ...extras];
  });

  const { error: itemError } = await supabase.from("learning_items").insert(itemRows);
  if (itemError) throw itemError;
}

export async function renameSet(setId: string, name: string) {
  const { error } = await supabase.from("word_sets").update({ name }).eq("id", setId);
  if (error) throw error;
}

export async function deleteSet(setId: string) {
  const { error } = await supabase.from("word_sets").delete().eq("id", setId);
  if (error) throw error;
}

/* ---------------------------------- words ---------------------------------- */

export async function getWord(wordId: string): Promise<{
  word: Word;
  sentences: Sentence[];
  items: LearningItem[];
  set: WordSet;
}> {
  const { data: word, error } = await supabase
    .from("words")
    .select("*")
    .eq("id", wordId)
    .single();
  if (error) throw error;

  const [{ data: sentences }, { data: items }, { data: set }] = await Promise.all([
    supabase.from("sentences").select("*").eq("word_id", wordId).order("variation_index"),
    supabase.from("learning_items").select("*").eq("word_id", wordId).is("form_id", null),
    supabase.from("word_sets").select("*").eq("id", word.set_id).single(),
  ]);

  return {
    word: word as Word,
    sentences: (sentences ?? []) as Sentence[],
    items: (items ?? []) as LearningItem[],
    set: set as WordSet,
  };
}

/* -------------------------------- sessions --------------------------------- */

/** Review status buckets, all derived from real stored performance. */
export type ReviewStatus = "due" | "new" | "learning" | "weak" | "strong" | "mastered";

export interface ReviewFilters {
  setId?: string | null;
  status?: ReviewStatus | null;
  /** Primary part of speech of the word, e.g. "verb". */
  pos?: string | null;
  skill?: Skill | null;
  /** Train one original word only. */
  wordId?: string | null;
  /** Train one derived form only. */
  formId?: string | null;
  /** Within a set: original words or derived forms. */
  scope?: "words" | "forms" | null;
}

export function matchesStatus(item: LearningItem, status: ReviewStatus): boolean {
  const mastery = Number(item.mastery);
  const errorRate = item.attempts > 0 ? item.mistakes / item.attempts : 0;
  switch (status) {
    case "due":
      return isDue(item);
    case "new":
      return item.attempts === 0;
    case "learning":
      return item.attempts > 0 && mastery < 60;
    case "weak":
      return item.attempts > 0 && (errorRate >= 0.34 || mastery < 35);
    case "strong":
      return mastery >= 60 && mastery < 85;
    case "mastered":
      return mastery >= 85;
  }
}

/**
 * Builds a session queue from real stored performance.
 * With no filters this is the global review queue (weakest & most overdue first).
 */
export async function buildQueue(
  deviceId: string,
  filters: ReviewFilters | string | null = null,
  limit = 10,
): Promise<Exercise[]> {
  const f: ReviewFilters = typeof filters === "string" ? { setId: filters } : (filters ?? {});
  let query = supabase.from("learning_items").select("*").eq("device_id", deviceId);
  if (f.setId) query = query.eq("set_id", f.setId);
  if (f.skill) query = query.eq("skill", f.skill);
  if (f.formId) query = query.eq("form_id", f.formId);
  else if (f.wordId) query = query.eq("word_id", f.wordId).is("form_id", null);
  if (f.scope === "words") query = query.is("form_id", null);
  if (f.scope === "forms") query = query.not("form_id", "is", null);
  const { data: rawItems, error } = await query;
  if (error) throw error;

  let items = (rawItems ?? []) as LearningItem[];
  if (f.wordId && !f.formId) items = items.filter((i) => UNIT_SKILLS.includes(i.skill) && i.form === "base");
  if (items.length === 0) return [];

  if (f.pos) {
    const { data: posWords } = await supabase
      .from("words")
      .select("id")
      .eq("part_of_speech", f.pos);
    const allowed = new Set((posWords ?? []).map((w) => w.id));
    items = items.filter((i) => allowed.has(i.word_id));
  }

  const explicit = Boolean(
    f.setId || f.skill || f.pos || f.wordId || f.formId || (f.status && f.status !== "due"),
  );
  let pool: LearningItem[];
  if (f.status) {
    pool = items.filter((i) => matchesStatus(i, f.status as ReviewStatus));
  } else {
    const due = items.filter((i) => isDue(i));
    pool = due.length > 0 ? due : explicit ? items : [];
  }
  pool = pool.slice();
  pool.sort((a, b) => priority(b) - priority(a));
  const selected = pool.slice(0, limit);
  if (selected.length === 0) return [];

  const wordIds = [...new Set(selected.map((i) => i.word_id))];
  const formIds = [...new Set(selected.map((i) => i.form_id).filter(Boolean))] as string[];
  const [{ data: words }, { data: sentences }, { data: formRows }] = await Promise.all([
    supabase.from("words").select("*").in("id", wordIds),
    supabase.from("sentences").select("*").in("word_id", wordIds),
    formIds.length
      ? supabase.from("word_forms").select("*").in("id", formIds)
      : Promise.resolve({ data: [] as WordForm[] }),
  ]);
  const formsById = new Map(((formRows ?? []) as WordForm[]).map((fr) => [fr.id, fr]));

  const exercises: Exercise[] = [];
  for (const item of selected) {
    const original = (words ?? []).find((w) => w.id === item.word_id) as Word | undefined;
    if (!original) continue;
    const form = item.form_id ? formsById.get(item.form_id) : undefined;
    if (item.form_id && !form) continue;
    // A derived form is trained as its own unit: its text, meaning and explanation.
    const word: Word = form
      ? {
          ...original,
          id: form.id,
          text: form.text,
          translation: form.translation,
          meaning: form.translation,
          pronunciation: form.pronunciation,
          part_of_speech: original.part_of_speech,
          alternative_parts_of_speech: [],
          explanation: `${form.form_label} · ${original.text}${form.explanation ? ` — ${form.explanation}` : ""}`,
        }
      : original;
    const wordSentences = ((sentences ?? []) as Sentence[]).filter(
      (s) => s.word_id === item.word_id,
    );
    // Rotate sentence variations so learners don't memorise a single sentence.
    const formSentences = wordSentences.filter((s) => s.form === item.form);
    const pickFrom = formSentences.length > 0 ? formSentences : wordSentences;
    const sentence =
      item.sentence_id && (item.skill === "form" || item.skill === "sentence_usage")
        ? (wordSentences.find((s) => s.id === item.sentence_id) ?? null)
        : (pickFrom[item.attempts % Math.max(pickFrom.length, 1)] ?? null);
    exercises.push({ item, word, sentence, skill: item.skill });
  }

  // Introduce a word before drilling it.
  const order: Record<Skill, number> = {
    recognition: 0,
    listening: 1,
    reading: 2,
    writing: 3,
    speaking: 4,
    recall: 5,
    sentence_usage: 6,
    form: 7,
  };
  exercises.sort((a, b) => order[a.skill] - order[b.skill]);
  return exercises;
}

export interface DueBreakdown {
  total: number;
  bySkill: Partial<Record<Skill, number>>;
  /** When the next item becomes due, if nothing is due right now. */
  nextReviewAt: string | null;
}

export async function getDueBreakdown(deviceId: string): Promise<DueBreakdown> {
  const now = new Date().toISOString();
  const [{ data, error }, { data: upcoming }] = await Promise.all([
    supabase
      .from("learning_items")
      .select("skill, next_review_at")
      .eq("device_id", deviceId)
      .lte("next_review_at", now),
    supabase
      .from("learning_items")
      .select("next_review_at")
      .eq("device_id", deviceId)
      .gt("next_review_at", now)
      .order("next_review_at", { ascending: true })
      .limit(1),
  ]);
  if (error) throw error;

  const bySkill: Partial<Record<Skill, number>> = {};
  for (const row of data ?? []) {
    const skill = row.skill as Skill;
    bySkill[skill] = (bySkill[skill] ?? 0) + 1;
  }
  return {
    total: (data ?? []).length,
    bySkill,
    nextReviewAt: upcoming?.[0]?.next_review_at ?? null,
  };
}

export interface ReviewOverview extends DueBreakdown {
  byStatus: Record<ReviewStatus, number>;
  /** Counts keyed by the word's stored primary part of speech. */
  byPos: Record<string, number>;
  bySet: { id: string; name: string; due: number; total: number }[];
}

const STATUSES: ReviewStatus[] = ["due", "new", "learning", "weak", "strong", "mastered"];

/** Everything the review dashboard shows, computed from stored review data. */
export async function getReviewOverview(deviceId: string): Promise<ReviewOverview> {
  const [{ data: rawItems, error }, { data: sets }] = await Promise.all([
    supabase.from("learning_items").select("*").eq("device_id", deviceId),
    supabase.from("word_sets").select("id, name").eq("device_id", deviceId),
  ]);
  if (error) throw error;

  const items = (rawItems ?? []) as LearningItem[];
  const wordIds = [...new Set(items.map((i) => i.word_id))];
  const { data: words } = wordIds.length
    ? await supabase.from("words").select("id, part_of_speech").in("id", wordIds)
    : { data: [] as { id: string; part_of_speech: string | null }[] };
  const posByWord = new Map((words ?? []).map((w) => [w.id, w.part_of_speech]));

  const bySkill: Partial<Record<Skill, number>> = {};
  const byPos: Record<string, number> = {};
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ReviewStatus, number>;
  let total = 0;
  let nextReviewAt: string | null = null;

  for (const item of items) {
    for (const status of STATUSES) if (matchesStatus(item, status)) byStatus[status] += 1;
    if (isDue(item)) {
      total += 1;
      bySkill[item.skill] = (bySkill[item.skill] ?? 0) + 1;
      const pos = posByWord.get(item.word_id);
      if (pos) byPos[pos] = (byPos[pos] ?? 0) + 1;
    } else if (!nextReviewAt || item.next_review_at < nextReviewAt) {
      nextReviewAt = item.next_review_at;
    }
  }

  const bySet = (sets ?? []).map((set) => {
    const setItems = items.filter((i) => i.set_id === set.id);
    return {
      id: set.id as string,
      name: set.name as string,
      due: setItems.filter((i) => isDue(i)).length,
      total: setItems.length,
    };
  });

  return { total, bySkill, nextReviewAt, byStatus, byPos, bySet };
}



/** Persists one analysed pronunciation recording alongside the SRS attempt. */
export async function recordPronunciation(input: {
  deviceId: string;
  itemId: string;
  target: string;
  transcript: string;
  score: number;
  matched: string[];
  missed: string[];
  attemptIndex: number;
}): Promise<void> {
  const { error } = await supabase.from("pronunciation_attempts").insert({
    device_id: input.deviceId,
    learning_item_id: input.itemId,
    target_text: input.target,
    transcript: input.transcript,
    score: input.score,
    matched_words: input.matched,
    missed_words: input.missed,
    attempt_index: input.attemptIndex,
  });
  if (error) throw error;
}

/** Persists one real attempt and re-schedules the item. */
export async function recordAttempt(
  deviceId: string,
  item: LearningItem,
  score: number,
  response: string | null,
): Promise<LearningItem> {
  const update = schedule(item, score);
  const [{ data, error }] = await Promise.all([
    supabase.from("learning_items").update(update).eq("id", item.id).select("*").single(),
    supabase.from("practice_attempts").insert({
      device_id: deviceId,
      learning_item_id: item.id,
      skill: item.skill,
      is_correct: score >= 0.6,
      score,
      response,
    }),
  ]);
  if (error) throw error;
  await supabase
    .from("word_sets")
    .update({ last_practiced_at: new Date().toISOString() })
    .eq("id", item.set_id);
  return data as LearningItem;
}

/* -------------------------------- progress --------------------------------- */

export async function getDailyProgress(deviceId: string): Promise<DailyProgress> {
  const { data } = await supabase
    .from("daily_progress")
    .select("*")
    .eq("device_id", deviceId)
    .eq("day", today())
    .maybeSingle();
  if (data) return data as DailyProgress;

  const learner = await ensureLearner(deviceId);
  const { data: created, error } = await supabase
    .from("daily_progress")
    .insert({ device_id: deviceId, day: today(), goal_minutes: learner.daily_goal_minutes })
    .select("*")
    .single();
  if (error) throw error;
  return created as DailyProgress;
}

/** Called when a session finishes: real minutes, real item count, real streak. */
export async function logSession(deviceId: string, minutes: number, itemsCompleted: number) {
  const progress = await getDailyProgress(deviceId);
  await supabase
    .from("daily_progress")
    .update({
      minutes_practiced: Number(progress.minutes_practiced) + minutes,
      items_completed: progress.items_completed + itemsCompleted,
    })
    .eq("id", progress.id);

  const learner = await ensureLearner(deviceId);
  const { data: history } = await supabase
    .from("daily_progress")
    .select("day, minutes_practiced")
    .eq("device_id", deviceId)
    .order("day", { ascending: false })
    .limit(60);

  const streak = computeStreak((history ?? []) as { day: string; minutes_practiced: number }[]);
  await updateLearner(deviceId, {
    streak,
    longest_streak: Math.max(learner.longest_streak, streak),
  });
}

function computeStreak(days: { day: string; minutes_practiced: number }[]): number {
  const active = new Set(days.filter((d) => Number(d.minutes_practiced) > 0).map((d) => d.day));
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!active.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface ProfileStats {
  totalWords: number;
  masteredWords: number;
  overallMastery: number;
}

export async function getProfileStats(deviceId: string): Promise<ProfileStats> {
  const { data } = await supabase
    .from("learning_items")
    .select("*")
    .eq("device_id", deviceId)
    .is("form_id", null);
  const items = (data ?? []) as LearningItem[];
  const wordIds = [...new Set(items.map((i) => i.word_id))];
  const units = wordIds.map((id) => wordSkillItems(items, id));
  const progress = units.map((u) =>
    UNIT_SKILLS.reduce((a, sk) => a + Number(u.find((i) => i.skill === sk)?.mastery ?? 0), 0) /
    UNIT_SKILLS.length,
  );
  return {
    totalWords: wordIds.length,
    masteredWords: units.filter((u) => unitMastered(u, UNIT_SKILLS)).length,
    overallMastery:
      progress.length === 0 ? 0 : Math.round(progress.reduce((a, b) => a + b, 0) / progress.length),
  };
}
