import { supabase } from "@/integrations/supabase/client";

import { generateSetContent } from "./generation.functions";
import { generateForms } from "./forms.functions";
import {
  FORM_SKILLS,
  UNIT_SKILLS,
  tagResponse,
  wordSkillItems,
  wordStatus,
  type SkillAttempt,
} from "./progress";
import { schedule } from "./srs";
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

/* ------------------------------ word attempts ------------------------------ */

/** Loads the stored graded attempts for the given learning items (chunked). */
async function fetchAttempts(itemIds: string[]): Promise<SkillAttempt[]> {
  const out: SkillAttempt[] = [];
  for (let i = 0; i < itemIds.length; i += 150) {
    const chunk = itemIds.slice(i, i + 150);
    const { data, error } = await supabase
      .from("practice_attempts")
      .select("learning_item_id, skill, is_correct, score, response, created_at")
      .in("learning_item_id", chunk)
      .order("created_at", { ascending: false });
    if (error) throw error;
    out.push(...((data ?? []) as SkillAttempt[]));
  }
  return out;
}

/** Original-word attempts (Writing, Pronunciation, Meaning only), grouped by word id. */
export async function wordAttemptsByWord(
  items: LearningItem[],
): Promise<Map<string, SkillAttempt[]>> {
  const unitItems = items.filter(
    (i) => !i.form_id && i.form === "base" && UNIT_SKILLS.includes(i.skill),
  );
  const wordByItem = new Map(unitItems.map((i) => [i.id, i.word_id]));
  const attempts = await fetchAttempts(unitItems.map((i) => i.id));
  const map = new Map<string, SkillAttempt[]>();
  for (const a of attempts) {
    const wordId = wordByItem.get(a.learning_item_id);
    if (!wordId) continue;
    const list = map.get(wordId) ?? [];
    list.push(a);
    map.set(wordId, list);
  }
  return map;
}

/* ---------------------------------- learner --------------------------------- */

export async function ensureLearner(deviceId: string): Promise<Learner> {
  const { data, error: readError } = await supabase
    .from("learners")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();
  if (readError) throw readError;
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

export async function listSets(deviceId: string, targetLanguage: string): Promise<SetSummary[]> {
  const [{ data: sets, error }, { data: words }, { data: items }] = await Promise.all([
    supabase
      .from("word_sets")
      .select("*")
      .eq("device_id", deviceId)
      .eq("target_language", targetLanguage)
      .order("created_at", { ascending: false }),
    supabase.from("words").select("id, set_id"),
    supabase.from("learning_items").select("*").eq("device_id", deviceId),
  ]);
  const { data: formRows } = await supabase
    .from("word_forms")
    .select("id, set_id, word_id")
    .eq("device_id", deviceId);
  if (error) throw error;

  const setIds = new Set((sets ?? []).map((set) => set.id));
  const attemptsByWord = await wordAttemptsByWord(((items ?? []) as LearningItem[]).filter((i) => setIds.has(i.set_id)));
  return (sets ?? []).map((set) => {
    const setWords = (words ?? []).filter((w) => w.set_id === set.id);
    const setItems = ((items ?? []) as LearningItem[]).filter((i) => i.set_id === set.id);
    const status: SetSummary["status"] =
      setItems.every((i) => i.attempts === 0)
        ? "new"
        : setWords.length > 0 &&
            setWords.every((w) => wordStatus(attemptsByWord.get(w.id) ?? []) === "mastered")
          ? "mastered"
          : "learning";
    const setWordIds = new Set(setWords.map((w) => w.id));
    const formCount = new Set(
      (formRows ?? []).filter((f) => f.set_id === set.id && setWordIds.has(f.word_id)).map((f) => f.id),
    ).size;
    return { ...(set as WordSet), wordCount: setWords.length, formCount, status };
  });
}

export async function getSet(setId: string): Promise<{
  set: WordSet;
  words: Word[];
  items: LearningItem[];
  forms: WordForm[];
  formsGenerated: boolean;
  attemptsByWord: Map<string, SkillAttempt[]>;
}> {
  const [{ data: set, error }, { data: words }, { data: items }, { data: forms }] =
    await Promise.all([
      supabase.from("word_sets").select("*").eq("id", setId).single(),
      supabase.from("words").select("*").eq("set_id", setId).order("position"),
      supabase.from("learning_items").select("*").eq("set_id", setId),
      supabase.from("word_forms").select("*").eq("set_id", setId).order("position"),
    ]);
  if (error) throw error;
  const attemptsByWord = await wordAttemptsByWord((items ?? []) as LearningItem[]);
  return {
    attemptsByWord,
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
  attempts: SkillAttempt[];
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

  const attempts =
    (await wordAttemptsByWord((items ?? []) as LearningItem[])).get(wordId) ?? [];
  return {
    attempts,
    word: word as Word,
    sentences: (sentences ?? []) as Sentence[],
    items: (items ?? []) as LearningItem[],
    set: set as WordSet,
  };
}

/* -------------------------------- sessions --------------------------------- */

export interface ReviewFilters {
  setId?: string | null;
  skill?: Skill | null;
  /** Train one original word only. */
  wordId?: string | null;
  /** Train one derived form only. */
  formId?: string | null;
  /** Within a set: original words or derived forms. */
  scope?: "words" | "forms" | null;
}

/**
 * Builds an extra-practice queue (weakest first) for a set, word or form.
 * Extra practice never touches the Word Set review schedule.
 */
export async function buildQueue(
  deviceId: string,
  filters: ReviewFilters | string | null = null,
  targetLanguage?: string,
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
  if (targetLanguage) {
    const { data: activeSets, error: setsError } = await supabase.from("word_sets").select("id").eq("device_id", deviceId).eq("target_language", targetLanguage);
    if (setsError) throw setsError;
    const allowed = new Set((activeSets ?? []).map((set) => set.id));
    items = items.filter((item) => allowed.has(item.set_id));
  }
  if (f.wordId && !f.formId) items = items.filter((i) => UNIT_SKILLS.includes(i.skill) && i.form === "base");
  if (items.length === 0) return [];

  // Every eligible item is trained: no fixed limit, never a subset of the set.
  const selected = items;

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
          form_label: form.form_label,
          form_parent: original.text,
          form_explanation: form.explanation,
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

  // Saved order: words by their position, forms by parent word then form
  // position. The session groups exercises per unit in this order.
  const wordPos = new Map(((words ?? []) as Word[]).map((w) => [w.id, w.position]));
  const unitKey = (e: Exercise) => {
    const form = e.item.form_id ? formsById.get(e.item.form_id) : undefined;
    return [wordPos.get(e.item.word_id) ?? 0, form ? form.position : -1] as const;
  };
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
  exercises.sort((a, b) => {
    const [aw, af] = unitKey(a);
    const [bw, bf] = unitKey(b);
    return aw - bw || af - bf || order[a.skill] - order[b.skill];
  });
  return exercises;
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
  sessionId?: string,
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
      response: sessionId ? tagResponse(sessionId, response) : response,
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

/** Minutes are always a finite, non-negative, whole number for display. */
function saneMinutes(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export async function getDailyProgress(deviceId: string, targetLanguage: string): Promise<DailyProgress> {
  const { data, error: readError } = await supabase
    .from("language_daily_progress")
    .select("*")
    .eq("device_id", deviceId)
    .eq("target_language", targetLanguage)
    .eq("day", today())
    .maybeSingle();
  if (readError) throw readError;
  if (data) return { ...(data as DailyProgress), minutes_practiced: saneMinutes(data.minutes_practiced) };

  const learner = await ensureLearner(deviceId);
  const { data: created, error } = await supabase
    .from("language_daily_progress")
    .upsert({ device_id: deviceId, day: today(), target_language: targetLanguage, goal_minutes: learner.daily_goal_minutes }, { onConflict: "device_id,day,target_language", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (created) return created as DailyProgress;
  const { data: existing, error: existingError } = await supabase.from("language_daily_progress").select("*").eq("device_id", deviceId).eq("day", today()).eq("target_language", targetLanguage).single();
  if (existingError) throw existingError;
  return existing as DailyProgress;
}

/** Called when a session finishes: real minutes, real item count, real streak. */
export async function logSession(deviceId: string, minutes: number, itemsCompleted: number, targetLanguage: string) {
  const progress = await getDailyProgress(deviceId, targetLanguage);
  const { error: saveError } = await supabase
    .from("language_daily_progress")
    .update({
      minutes_practiced: saneMinutes(progress.minutes_practiced) + saneMinutes(minutes),
      items_completed: progress.items_completed + itemsCompleted,
    })
    .eq("id", progress.id);
  if (saveError) throw saveError;

  const learner = await ensureLearner(deviceId);
  const { data: history } = await supabase
    .from("language_daily_progress")
    .select("day, minutes_practiced")
    .eq("device_id", deviceId)
    .eq("target_language", targetLanguage)
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
  learningWords: number;
}

export async function getProfileStats(deviceId: string, targetLanguage: string): Promise<ProfileStats> {
  const { data: sets, error: setsError } = await supabase.from("word_sets").select("id").eq("device_id", deviceId).eq("target_language", targetLanguage);
  if (setsError) throw setsError;
  const setIds = (sets ?? []).map((set) => set.id);
  if (setIds.length === 0) return { totalWords: 0, masteredWords: 0, learningWords: 0, overallMastery: 0 };
  const { data, error } = await supabase
    .from("learning_items")
    .select("*")
    .eq("device_id", deviceId)
    .in("set_id", setIds)
    .is("form_id", null);
  if (error) throw error;
  const items = (data ?? []) as LearningItem[];
  const wordIds = [...new Set(items.map((i) => i.word_id))];
  const units = wordIds.map((id) => wordSkillItems(items, id));
  const attemptsByWord = await wordAttemptsByWord(items);
  const progress = units.map((u) =>
    UNIT_SKILLS.reduce((a, sk) => a + Number(u.find((i) => i.skill === sk)?.mastery ?? 0), 0) /
    UNIT_SKILLS.length,
  );
  return {
    totalWords: wordIds.length,
    masteredWords: wordIds.filter((id) => wordStatus(attemptsByWord.get(id) ?? []) === "mastered")
      .length,
    learningWords: wordIds.filter((id) => wordStatus(attemptsByWord.get(id) ?? []) === "learning")
      .length,
    overallMastery:
      progress.length === 0 ? 0 : Math.round(progress.reduce((a, b) => a + b, 0) / progress.length),
  };
}
