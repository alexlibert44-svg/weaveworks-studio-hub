import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * AI content generation. Every word the learner enters is turned into a
 * translation, a pronunciation guide and several natural sentences in the
 * language they are learning — including context variations and grammatical
 * forms used later by the spaced-repetition schedule.
 *
 * There is no template fallback on purpose: if generation fails the caller
 * surfaces the error instead of storing invented content.
 */

const WordHint = z.object({
  /** A chunk exactly as it appears in the NATIVE-language translation. */
  native: z.string().min(1),
  /** What that chunk corresponds to in the TARGET-language sentence. */
  target: z.string().min(1),
});

const GeneratedSentence = z.object({
  text: z.string().min(1),
  translation: z.string().min(1),
  form: z.string().min(1),
  variation_index: z.number().int().min(0),
  /** Word/phrase alignment between the translation and the target sentence. */
  word_hints: z.array(WordHint).default([]),
});

const GeneratedWord = z.object({
  /** Echo of the word the learner typed, used only for matching. */
  word: z.string().min(1),
  /** The word written in the language being learned. */
  target_word: z.string().min(1),
  translation: z.string().min(1),
  pronunciation: z.string().default(""),
  part_of_speech: z.string().default(""),
  /** Other genuine grammatical uses of the same word, e.g. "light" as verb. */
  alternative_parts_of_speech: z.array(z.string().min(1)).default([]),
  /** 1 (very easy) .. 5 (advanced). */
  difficulty: z.number().int().min(1).max(5).default(2),
  /** Semantic metadata only — never used to move a word between sets. */
  tags: z.array(z.string().min(1)).default([]),
  sentences: z.array(GeneratedSentence).min(1),
});

export type GeneratedWordContent = z.infer<typeof GeneratedWord>;

const Input = z.object({
  words: z.array(z.string().min(1)).min(1).max(30),
  /** English name of the language being learned, e.g. "Spanish". */
  targetLanguage: z.string().min(2),
  /** English name of the learner's own language, e.g. "Arabic". */
  nativeLanguage: z.string().min(2),
});

const SYSTEM = `You are a language-learning content author. You produce study material for one learner.
Rules:
- "word" repeats the learner's input exactly as given.
- "target_word" is that vocabulary item written in the TARGET language (translate it when the learner typed it in their own language; keep it as-is when it is already target-language).
- Every "text" field is written in the TARGET language only.
- Every "translation" field is written in the NATIVE language only.
- Sentences must be natural, everyday, 4-12 words, and must actually contain the word (inflected as needed).
- For each word return exactly 4 sentences:
  1. form "base", variation_index 0 — simple present-tense statement.
  2. form "base", variation_index 1 — a different everyday context, still simple.
  3. a different grammatical form, variation_index 2 — use one of: "past", "future", "negative", "question", "plural", "comparative" (choose what fits the word).
  4. another different grammatical form, variation_index 3 — a different label from #3.
- "pronunciation" is a short readable phonetic hint for the target-language word.
- "part_of_speech" is the word's PRIMARY grammatical class for the learning context, chosen from exactly this list (lowercase English): noun, verb, adjective, adverb, pronoun, preposition, conjunction, determiner, expression, other.
- "alternative_parts_of_speech" lists other genuine classes of the same word from the same list (e.g. "light" -> ["verb","adjective"]). Use an empty array when the word has only one real class. Never repeat the primary class.
- "difficulty" is 1..5 for how hard the word is for a learner.
- "tags" holds 1-3 lowercase English topic tags (metadata only).
- "word_hints" aligns the NATIVE translation with the TARGET sentence, chunk by chunk, in the order the chunks appear in the translation. Each "native" value MUST be a substring copied verbatim from that sentence's "translation" (a single word, or a short phrase when the languages do not map one-to-one), and "target" is the matching word or phrase copied from "text". Cover every meaningful chunk of the translation; skip nothing important and never invent chunks that are not in the translation.
Return JSON only, no prose, no markdown fences.`;

export const generateSetContent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI is not configured for this project.");

    const prompt = `TARGET language: ${data.targetLanguage}
NATIVE language: ${data.nativeLanguage}
Words (given by the learner, may be written in either language — always treat them as vocabulary to learn in ${data.targetLanguage}): ${data.words.join(", ")}

Return this exact JSON shape:
{"words":[{"word":"<the word exactly as given>","target_word":"<the word in ${data.targetLanguage}>","translation":"<meaning in ${data.nativeLanguage}>","pronunciation":"","part_of_speech":"","alternative_parts_of_speech":[],"difficulty":2,"tags":[],"sentences":[{"text":"","translation":"","form":"base","variation_index":0,"word_hints":[{"native":"","target":""}]}]}]}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Lovable-API-Key": key,
      },
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
      const body = await response.text();
      if (response.status === 429) throw new Error("AI is busy right now. Please try again.");
      if (response.status === 402 || response.status === 403) {
        throw new Error("AI credits are unavailable for this project.");
      }
      throw new Error(`AI generation failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("AI returned an unreadable response.");
    }

    const result = z.object({ words: z.array(GeneratedWord).min(1) }).safeParse(parsed);
    if (!result.success) throw new Error("AI returned incomplete lesson content.");

    // Keep the learner's original order and drop anything the model invented.
    const byWord = new Map(result.data.words.map((w) => [w.word.trim().toLowerCase(), w]));
    const ordered = data.words.map((word) => {
      const found = byWord.get(word.trim().toLowerCase());
      if (!found) throw new Error(`No lesson content was generated for “${word}”.`);
      return { ...found, word };
    });

    return ordered;
  });
