import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Word alignment for one sentence pair: every word of the learner's-language
 * translation mapped to the target-language word(s) it corresponds to in
 * context (null when there is no reliable match). Generated once, saved on the
 * sentence row and reused.
 */
const Input = z.object({
  sentenceId: z.string().uuid(),
  targetLanguage: z.string().min(2),
  nativeLanguage: z.string().min(2),
  /** Token index (whitespace-separated words of the translation) still unmatched. */
  resolve: z.number().int().min(0).optional(),
});

const Gloss = z.object({ word: z.string(), meaning: z.string().nullable() });
export type WordGloss = z.infer<typeof Gloss> & { i: number; tried?: boolean };
const SavedV2 = z.object({ v: z.literal(2), words: z.array(Gloss).min(1) });
const SavedV3 = z.object({
  v: z.literal(3),
  words: z.array(z.object({ i: z.number(), word: z.string(), meaning: z.string().nullable(), tried: z.boolean().optional() })),
});

/** Case, diacritic and punctuation-insensitive form used to check a match really is in the sentence. */
const norm = (t: string) =>
  t.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

async function ask(key: string, system: string, user: string): Promise<unknown> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model: "google/gemini-3.7-flash",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("AI is busy right now. Please try again.");
    if (response.status === 402 || response.status === 403) throw new Error("AI credits are unavailable for this project.");
    throw new Error(`Word meanings failed (${response.status}).`);
  }
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = (payload.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("AI returned an unreadable response.");
  }
}

/**
 * Context alignment for one sentence pair, keyed by the index of each
 * whitespace-separated translation word (never by position matching between
 * languages). Saved on the sentence row; unmatched words are resolved one at a
 * time on demand and saved too.
 */
export const getWordGlosses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<WordGloss[]> => {
    const { data: row, error } = await context.supabase
      .from("sentences")
      .select("id, text, translation, word_glosses")
      .eq("id", data.sentenceId)
      .single();
    if (error || !row) throw new Error("Sentence not found.");
    if (!row.translation) throw new Error("This sentence has no translation.");
    const tokens = row.translation.split(/\s+/).filter(Boolean);
    const original = norm(row.text);
    const inSentence = (m: string | null) => (m && original.includes(norm(m)) && norm(m) ? m : null);
    const save = (words: WordGloss[]) =>
      context.supabase.from("sentences").update({ word_glosses: { v: 3, words } }).eq("id", row.id);

    let words: WordGloss[] | null = null;
    const v3 = SavedV3.safeParse(row.word_glosses);
    const v2 = SavedV2.safeParse(row.word_glosses);
    if (v3.success) words = v3.data.words;
    else if (v2.success && v2.data.words.length === tokens.length) {
      words = v2.data.words.map((w, i) => ({ ...w, i }));
      await save(words);
    }

    const key = process.env["LOVABLE_API_KEY"];
    if (!words) {
      if (!key) throw new Error("AI is not configured for this project.");
      const list = tokens.map((t, i) => `${i}: ${t}`).join("\n");
      const parsed = await ask(
        key,
        `You align a ${data.nativeLanguage} translation with its original ${data.targetLanguage} sentence by meaning in context (word order differs between languages; never align by position).
For EVERY numbered ${data.nativeLanguage} word, give the ${data.targetLanguage} word or multi-word expression from the ORIGINAL sentence it corresponds to, copied exactly as written there (include attached articles/prepositions when they form one unit). Use null only when the word truly has no counterpart (e.g. a purely grammatical word).
Return JSON only: {"words":[{"i":0,"meaning":""}]}`,
        `Original (${data.targetLanguage}): ${row.text}\nTranslation words:\n${list}`,
      );
      const result = z.object({ words: z.array(z.object({ i: z.number(), meaning: z.string().nullable() })) }).safeParse(parsed);
      if (!result.success) throw new Error("AI returned incomplete word meanings.");
      const byIndex = new Map(result.data.words.map((w) => [w.i, w.meaning]));
      words = tokens.map((word, i) => ({ i, word, meaning: inSentence(byIndex.get(i) ?? null) }));
      await save(words);
    }

    const target = data.resolve;
    const missing = target === undefined ? undefined : words.find((w) => w.i === target);
    if (missing && !missing.meaning && !missing.tried && key) {
      // One unmatched word: resolve just that word, never the whole sentence.
      const parsed = await ask(
        key,
        `In the ${data.targetLanguage} sentence, find the word or expression that the ${data.nativeLanguage} word "${missing.word}" translates in context. Copy it exactly from the sentence. If nothing in the sentence corresponds to it, use null.
Return JSON only: {"meaning":""}`,
        `Original (${data.targetLanguage}): ${row.text}\nTranslation (${data.nativeLanguage}): ${row.translation}\nWord #${missing.i}: ${missing.word}`,
      ).catch(() => null);
      const m = z.object({ meaning: z.string().nullable() }).safeParse(parsed);
      if (m.success) {
        missing.meaning = inSentence(m.data.meaning);
        missing.tried = true;
        await save(words);
      }
    }
    return words;
  });
