import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Contextual meaning of every word in one target-language sentence, in the
 * learner's own language. Generated once and saved on the sentence row.
 */
const Input = z.object({
  sentenceId: z.string().uuid(),
  targetLanguage: z.string().min(2),
  nativeLanguage: z.string().min(2),
});

const Gloss = z.object({ word: z.string(), meaning: z.string() });
export type WordGloss = z.infer<typeof Gloss>;

export const getWordGlosses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<WordGloss[]> => {
    const { data: row, error } = await context.supabase
      .from("sentences")
      .select("id, text, word_glosses")
      .eq("id", data.sentenceId)
      .single();
    if (error || !row) throw new Error("Sentence not found.");
    const saved = z.array(Gloss).safeParse(row.word_glosses);
    if (saved.success && saved.data.length > 0) return saved.data;

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this project.");
    const system = `You explain ${data.targetLanguage} sentences to a learner whose language is ${data.nativeLanguage}.
For EVERY word of the sentence, in order, give its meaning AS USED IN THIS SENTENCE, written in ${data.nativeLanguage} (1-4 words).
"word" must be copied exactly as it appears in the sentence (without punctuation).
Return JSON only: {"words":[{"word":"","meaning":""}]}`;
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: row.text },
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
    await context.supabase
      .from("sentences")
      .update({ word_glosses: result.data.words })
      .eq("id", row.id);
    return result.data.words;
  });
