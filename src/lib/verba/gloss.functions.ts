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
});

const Gloss = z.object({ word: z.string(), meaning: z.string().nullable() });
const Saved = z.object({ v: z.literal(2), words: z.array(Gloss).min(1) });
export type WordGloss = z.infer<typeof Gloss>;

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
    const saved = Saved.safeParse(row.word_glosses);
    if (saved.success) return saved.data.words;

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this project.");
    const system = `You align a ${data.nativeLanguage} translation with its original ${data.targetLanguage} sentence, word by word, using meaning in context (never word position — word order differs between languages).
For EVERY whitespace-separated word of the ${data.nativeLanguage} translation, in order, give the ${data.targetLanguage} word or expression from the ORIGINAL sentence that it corresponds to. Use the complete expression when one word maps to several (e.g. an Arabic word with attached article/preposition). Copy target text exactly as it appears in the original sentence.
"word" must be copied exactly from the translation (without punctuation). Use null for "meaning" when there is no reliable correspondence.
Return JSON only: {"words":[{"word":"","meaning":"" }]}`;
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Original (${data.targetLanguage}): ${row.text}\nTranslation (${data.nativeLanguage}): ${row.translation}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error("AI is busy right now. Please try again.");
      if (response.status === 402 || response.status === 403) {
        throw new Error("AI credits are unavailable for this project.");
      }
      throw new Error(`Word meanings failed (${response.status}).`);
    }
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = (payload.choices?.[0]?.message?.content ?? "")
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("AI returned an unreadable response.");
    }
    const result = z.object({ words: z.array(Gloss).min(1) }).safeParse(parsed);
    if (!result.success) throw new Error("AI returned incomplete word meanings.");
    // Drop matches that aren't actually in the original sentence.
    const original = row.text.toLowerCase();
    const words = result.data.words.map((w) => ({
      word: w.word,
      meaning: w.meaning && original.includes(w.meaning.toLowerCase()) ? w.meaning : null,
    }));
    await context.supabase
      .from("sentences")
      .update({ word_glosses: { v: 2, words } })
      .eq("id", row.id);
    return words;
  });
