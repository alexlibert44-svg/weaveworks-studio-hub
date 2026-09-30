import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * User-initiated Tenses & Forms generation. Runs only when the learner
 * presses "Create tenses & forms". Words without genuine inflected forms are
 * returned with an empty list and are never shown in the section.
 */

const Form = z.object({
  text: z.string().min(1),
  form_label: z.string().min(1),
  form_kind: z.string().default("inflection"),
  is_regular: z.boolean().nullable().default(null),
  translation: z.string().default(""),
  explanation: z.string().default(""),
  example: z.string().min(1),
  example_translation: z.string().default(""),
  pronunciation: z.string().default(""),
});

const WordForms = z.object({
  word_id: z.string().min(1),
  category: z.string().default(""),
  forms: z.array(Form).default([]),
});

export type GeneratedForms = z.infer<typeof WordForms>;

const Input = z.object({
  words: z
    .array(z.object({ id: z.string(), text: z.string(), part_of_speech: z.string().nullable() }))
    .min(1)
    .max(40),
  targetLanguage: z.string().min(2),
  nativeLanguage: z.string().min(2),
});

const SYSTEM = `You are a precise linguist writing a "Tenses & Forms" lesson for one learner.
For each TARGET-language word decide whether it has genuine inflected forms worth learning.
Include ONLY: verb tense/aspect forms and participles, 3rd-person/person-number conjugations, noun plurals (and gender/case forms where the language really has them).
EXCLUDE: prepositions, articles, conjunctions, particles, adverbs, invariable words, derivations (e.g. happy -> happiness), comparatives/superlatives (e.g. good -> better, best), and unrelated vocabulary. For such words return "forms": [].
Never invent forms. Never repeat the original word itself as a form.
"form_label" names the isolated form accurately, written in the NATIVE language (e.g. "Past simple", "Past participle", "Present participle / -ing form", "3rd person singular present", "Plural"). An isolated -ing form must NOT be labelled as a continuous tense — a continuous tense is a construction such as "I am going".
"form_kind" is one of: tense, participle, conjugation, plural, other.
"is_regular" is true for regular formation, false for irregular, null if not applicable.
"translation" is the meaning of the form in the NATIVE language.
"explanation" is 1-2 short sentences in the NATIVE language saying what changed, why, and what the form is used for.
"example" is a natural 4-12 word TARGET-language sentence containing exactly that form; "example_translation" is its NATIVE translation.
"pronunciation" is a short readable phonetic hint.
Order forms in a meaningful educational order (e.g. for English verbs: 3rd person singular, past simple, past participle, -ing form).
"category" is the word's grammatical category written in the NATIVE language (e.g. "Verb", "Noun").
Return JSON only.`;

export const generateForms = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this project.");

    const prompt = `TARGET language: ${data.targetLanguage}
NATIVE language: ${data.nativeLanguage}
Words:
${data.words.map((w) => `- id=${w.id} word="${w.text}" class=${w.part_of_speech ?? "unknown"}`).join("\n")}

Return: {"words":[{"word_id":"<id>","category":"","forms":[{"text":"","form_label":"","form_kind":"","is_regular":true,"translation":"","explanation":"","example":"","example_translation":"","pronunciation":""}]}]}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.7-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("AI is busy right now. Please try again.");
      if (response.status === 402 || response.status === 403) {
        throw new Error("AI credits are unavailable for this project.");
      }
      throw new Error(`AI generation failed (${response.status}).`);
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
    const result = z.object({ words: z.array(WordForms) }).safeParse(parsed);
    if (!result.success) throw new Error("AI returned incomplete forms.");

    const ids = new Set(data.words.map((w) => w.id));
    const original = new Map(data.words.map((w) => [w.id, w.text.trim().toLowerCase()]));
    return result.data.words
      .filter((w) => ids.has(w.word_id))
      .map((w) => ({
        ...w,
        forms: w.forms.filter((f) => f.text.trim().toLowerCase() !== original.get(w.word_id)),
      }));
  });
