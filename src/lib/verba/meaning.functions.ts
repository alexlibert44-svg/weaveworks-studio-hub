import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Meaning multiple-choice: plausible distractors generated independently of
 * the learner's Word Set, validated before they are ever shown. The correct
 * answer is always the learner's own saved meaning — the AI never picks it.
 */
const Input = z.object({
  word: z.string().min(1).max(200),
  correct: z.string().min(1).max(300),
  partOfSpeech: z.string().max(60).nullable().optional(),
  context: z.string().max(500).nullable().optional(),
  targetLanguage: z.string().min(2).max(40),
  nativeLanguage: z.string().min(2).max(40),
  avoid: z.array(z.string().max(300)).max(30).optional(),
});

const Distractor = z.object({ text: z.string().min(1), why: z.string().min(1) });
const Output = z.object({
  distractors: z.array(Distractor).min(3),
  explanation: z.string().min(1),
});

export interface MeaningQuestion {
  distractors: { text: string; why: string }[];
  explanation: string;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFKC").replace(/[\p{P}\p{S}\u064B-\u0652]/gu, "").replace(/\s+/g, " ").trim();

function validate(correct: string, raw: unknown): MeaningQuestion | null {
  const parsed = Output.safeParse(raw);
  if (!parsed.success) return null;
  const c = norm(correct);
  const seen = new Set<string>([c]);
  const good: MeaningQuestion["distractors"] = [];
  for (const d of parsed.data.distractors) {
    const n = norm(d.text);
    if (!n || seen.has(n)) continue;
    // Reject options that contain or are contained in the correct answer (near-synonyms / paraphrases).
    if (n.includes(c) || c.includes(n)) continue;
    seen.add(n);
    good.push({ text: d.text.trim(), why: d.why.trim() });
    if (good.length === 3) break;
  }
  if (good.length < 3) return null;
  return { distractors: good, explanation: parsed.data.explanation.trim() };
}

export const getMeaningQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<MeaningQuestion> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this project.");
    const system = `You write distractors for a vocabulary multiple-choice question for a learner of ${data.targetLanguage} whose native language is ${data.nativeLanguage}.
The learner sees the ${data.targetLanguage} word and must pick its meaning. The correct option is fixed (given below) — do not change it.
Write 5 WRONG options in ${data.nativeLanguage}:
- Real, plausible meanings of OTHER ${data.targetLanguage} words (same part of speech and similar difficulty; ideally words a learner could confuse by form or topic).
- Each must be clearly WRONG for this word in the given context — never a synonym, paraphrase, or any other legitimate meaning of the target word (including meanings in other contexts or parts of speech).
- Match the correct option's length, style and formatting so length gives no hint. No absurd options, no duplicates.
- Avoid these previously used options when possible: ${(data.avoid ?? []).join(" | ") || "none"}.
For each give "why": one short ${data.nativeLanguage} sentence on why it doesn't fit here.
"explanation": one or two short ${data.nativeLanguage} sentences explaining the correct meaning of the word in this context.
Return JSON only: {"distractors":[{"text":"","why":""}],"explanation":""}`;
    const user = `Word: ${data.word}${data.partOfSpeech ? ` (${data.partOfSpeech})` : ""}
Correct meaning: ${data.correct}${data.context ? `\nContext sentence: ${data.context}` : ""}`;

    let lastError = "AI returned an invalid question.";
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify({
          model: "google/gemini-3.7-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!response.ok) {
        if (response.status === 429) throw new Error("AI is busy right now. Please try again.");
        if (response.status === 402 || response.status === 403) {
          throw new Error("AI credits are unavailable for this project.");
        }
        lastError = `Question generation failed (${response.status}).`;
        continue;
      }
      const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = (payload.choices?.[0]?.message?.content ?? "")
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
      try {
        const question = validate(data.correct, JSON.parse(content));
        if (question) return question;
      } catch {
        /* regenerate */
      }
    }
    throw new Error(lastError);
  });
