import { supabase } from "@/integrations/supabase/client";
import { language } from "@/lib/i18n/languages";

import { prepareAudio } from "./audio.functions";
import { generateSetContent } from "./generation.functions";
import { getMeaningQuestion } from "./meaning.functions";
import type { Skill, Word, WordForm } from "./types";

/**
 * Word analysis happens when a Word Set is created (or when the learner taps
 * "Retry"), never during training. Each word is analysed on its own so one
 * failure never loses the other words or the set:
 *   pending -> (translation, sentences, learning items, meaning-quiz options) -> ready
 *   any error -> failed (kept, retryable)
 * Already-saved content is never regenerated.
 */

const CORE_SKILLS: Skill[] = ["recognition", "writing", "speaking", "recall"];

interface SetLangs {
  target: string;
  native: string;
  /** Speech language name, identical to the one the audio button sends. */
  speech: string;
}

/** Same naming as the audio button (speech.ts) so stored audio is found again. */
function speechLanguage(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code.split("-")[0] ?? code) ?? code;
  } catch {
    return code;
  }
}

/** Generates (or reuses) stored audio; throws when any file could not be stored. */
async function ensureStoredAudio(texts: (string | null | undefined)[], langs: SetLangs) {
  const list = texts.map((t) => t?.trim()).filter((t): t is string => Boolean(t));
  if (list.length === 0) return;
  const { failed } = await prepareAudio({ data: { language: langs.speech, texts: list } });
  if (failed.length) throw new Error(`Audio could not be prepared for ${failed.length} item(s).`);
}

async function setLanguages(setId: string): Promise<SetLangs> {
  const { data, error } = await supabase
    .from("word_sets")
    .select("target_language, native_language")
    .eq("id", setId)
    .single();
  if (error) throw error;
  return {
    target: language(data.target_language).english,
    native: language(data.native_language).english,
    speech: speechLanguage(data.target_language),
  };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** True when a word has everything training needs, all saved in the database. */
export function wordReady(word: Pick<Word, "analysis_status" | "translation" | "meaning_options">) {
  return (
    (word.analysis_status ?? "ready") === "ready" &&
    Boolean(word.translation) &&
    Array.isArray(word.meaning_options) &&
    word.meaning_options.length >= 3
  );
}

async function generateOptions(input: {
  word: string;
  correct: string;
  partOfSpeech: string | null;
  context: string | null;
  langs: SetLangs;
}): Promise<string[]> {
  const q = await getMeaningQuestion({
    data: {
      word: input.word,
      correct: input.correct,
      partOfSpeech: input.partOfSpeech,
      context: input.context,
      targetLanguage: input.langs.target,
      nativeLanguage: input.langs.native,
    },
  });
  return q.distractors.map((d) => d.text);
}

/** Analyses one original word, generating only what is still missing. */
async function analyzeWord(deviceId: string, setId: string, word: Word, langs: SetLangs): Promise<void> {
  try {
    let current = word;
    if (!current.translation) {
      const [g] = await generateSetContent({
        data: { words: [current.text], targetLanguage: langs.target, nativeLanguage: langs.native },
      });
      if (!g) throw new Error("No content was generated for this word.");
      // Clear partial rows from an earlier failed attempt so nothing is duplicated.
      await supabase.from("learning_items").delete().eq("word_id", current.id).is("form_id", null);
      await supabase.from("sentences").delete().eq("word_id", current.id).not("form", "like", "form:%");
      const { data: sentences, error: sError } = await supabase
        .from("sentences")
        .insert(
          g.sentences.map((s) => ({
            word_id: current.id,
            text: s.text,
            translation: s.translation,
            form: s.form,
            variation_index: s.variation_index,
            is_ai_generated: true,
            word_hints: s.word_hints ?? [],
          })),
        )
        .select("*");
      if (sError) throw sError;
      const base = (sentences ?? []).find((s) => s.form === "base" && s.variation_index === 0);
      const now = Date.now();
      const items = [
        ...CORE_SKILLS.map((skill) => ({
          device_id: deviceId,
          set_id: setId,
          word_id: current.id,
          sentence_id: base?.id ?? null,
          skill,
          form: "base",
          next_review_at: new Date(now).toISOString(),
        })),
        ...(sentences ?? [])
          .filter((s) => s.form === "base" && s.variation_index !== 0)
          .map((s, index) => ({
            device_id: deviceId,
            set_id: setId,
            word_id: current.id,
            sentence_id: s.id,
            skill: "sentence_usage" as Skill,
            form: s.form,
            next_review_at: new Date(now + (index + 2) * 86400000).toISOString(),
          })),
      ];
      const { error: iError } = await supabase.from("learning_items").insert(items);
      if (iError) throw iError;
      const { data: updated, error: uError } = await supabase
        .from("words")
        .update({
          text: g.target_word,
          translation: g.translation,
          meaning: g.translation,
          pronunciation: g.pronunciation || null,
          part_of_speech: g.part_of_speech || null,
          alternative_parts_of_speech: g.alternative_parts_of_speech ?? [],
          difficulty: g.difficulty ?? null,
          tags: g.tags ?? [],
          analysis_status: "pending",
          analysis_error: null,
        })
        .eq("id", current.id)
        .select("*")
        .single();
      if (uError) throw uError;
      current = updated as unknown as Word;
    }
    if (!Array.isArray(current.meaning_options) || current.meaning_options.length < 3) {
      const { data: base } = await supabase
        .from("sentences")
        .select("text")
        .eq("word_id", current.id)
        .eq("form", "base")
        .eq("variation_index", 0)
        .maybeSingle();
      const options = await generateOptions({
        word: current.text,
        correct: current.translation as string,
        partOfSpeech: current.part_of_speech,
        context: base?.text ?? null,
        langs,
      });
      const { error } = await supabase.from("words").update({ meaning_options: options }).eq("id", current.id);
      if (error) throw error;
    }
    // Audio for the word and its sentences must be stored before the word is ready.
    const { data: sentenceRows } = await supabase
      .from("sentences")
      .select("text")
      .eq("word_id", current.id)
      .not("form", "like", "form:%");
    await ensureStoredAudio([current.text, ...(sentenceRows ?? []).map((r) => r.text)], langs);
    const { error } = await supabase
      .from("words")
      .update({ analysis_status: "ready", analysis_error: null })
      .eq("id", current.id);
    if (error) throw error;
  } catch (e) {
    await supabase
      .from("words")
      .update({ analysis_status: "failed", analysis_error: errorText(e) })
      .eq("id", word.id);
  }
}

async function analyzeForm(form: WordForm, langs: SetLangs): Promise<void> {
  // Best effort: stored audio is reused, so this only generates what is missing.
  await ensureStoredAudio([form.text, form.example], langs).catch(() => undefined);
  if (!form.translation || (Array.isArray(form.meaning_options) && form.meaning_options.length >= 3)) return;
  try {
    const options = await generateOptions({
      word: form.text,
      correct: form.translation,
      partOfSpeech: form.form_label,
      context: form.example,
      langs,
    });
    await supabase.from("word_forms").update({ meaning_options: options }).eq("id", form.id);
  } catch {
    /* stays unprepared; the set page offers a retry */
  }
}

async function inBatches<T>(list: T[], size: number, run: (x: T) => Promise<void>) {
  for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(run));
}

/**
 * Prepares every word and form in the set that still lacks saved analysis.
 * Safe to call repeatedly: ready items are skipped.
 */
export async function prepareSet(deviceId: string, setId: string): Promise<void> {
  const langs = await setLanguages(setId);
  const [{ data: words }, { data: forms }] = await Promise.all([
    supabase.from("words").select("*").eq("set_id", setId).order("position"),
    supabase.from("word_forms").select("*").eq("set_id", setId),
  ]);
  const todo = ((words ?? []) as unknown as Word[]).filter((w) => !wordReady(w));
  await inBatches(todo, 3, (w) => analyzeWord(deviceId, setId, w, langs));
  await inBatches((forms ?? []) as unknown as WordForm[], 4, (f) => analyzeForm(f, langs));
}

/** Summary used by the set page and the practice gate. */
export async function setReadiness(setId: string, kind: "words" | "forms") {
  const [{ data: words }, { data: forms }] = await Promise.all([
    supabase.from("words").select("id, translation, analysis_status, meaning_options").eq("set_id", setId),
    kind === "forms"
      ? supabase.from("word_forms").select("id, translation, meaning_options").eq("set_id", setId)
      : Promise.resolve({ data: [] as { id: string; translation: string | null; meaning_options: unknown }[] }),
  ]);
  const ws = (words ?? []) as unknown as Word[];
  const failed = ws.filter((w) => w.analysis_status === "failed").length;
  const notReady = ws.filter((w) => !wordReady(w)).length;
  const formsMissing = (forms ?? []).filter(
    (f) => !Array.isArray(f.meaning_options) || (f.meaning_options as unknown[]).length < 3,
  ).length;
  return { failed, notReady, formsMissing, ready: notReady === 0 && formsMissing === 0 };
}
