import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Evaluates a sentence the learner wrote with a target word. Feedback is in
 * the learner's own language. On any technical failure this throws — the
 * caller keeps the answer and lets the learner retry; it is never marked
 * successful by default.
 */
const Input = z.object({
  word: z.string().min(1),
  sentence: z.string().min(1).max(500),
  targetLanguage: z.string().min(2),
  nativeLanguage: z.string().min(2),
});

const Output = z.object({
  uses_word: z.boolean(),
  correct: z.boolean(),
  feedback: z.string().min(1),
  corrected: z.string().nullable().default(null),
});

export type SentenceEvaluation = z.infer<typeof Output>;

export const evaluateSentence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<SentenceEvaluation> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this project.");

    const system = `You are a precise ${data.targetLanguage} teacher. A learner wrote one sentence using a target word.
Check: the target word (or a correct inflection) is actually used; correct word form; meaning fits; grammar; context; naturalness; comprehensibility.
"correct" is true only if the word is used correctly AND the sentence is grammatical and understandable (tiny style issues are OK).
"feedback": 1-2 short sentences written ONLY in ${data.nativeLanguage}.
"corrected": a natural corrected ${data.targetLanguage} sentence when changes are needed, else null.
Return JSON only: {"uses_word":bool,"correct":bool,"feedback":"","corrected":null}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Target word: ${data.word}\nSentence: ${data.sentence}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error("AI is busy right now. Please try again.");
      if (response.status === 402 || response.status === 403) {
        throw new Error("AI credits are unavailable for this project.");
      }
      throw new Error(`Evaluation failed (${response.status}).`);
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
    const result = Output.safeParse(parsed);
    if (!result.success) throw new Error("AI returned an incomplete evaluation.");
    return { ...result.data, correct: result.data.correct && result.data.uses_word };
  });
