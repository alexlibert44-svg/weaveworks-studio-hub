/**
 * Part-of-speech labels. The AI is constrained to a fixed list, but if it ever
 * returns something else we show the raw value instead of a missing-key string.
 */
const KNOWN = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "expression",
  "other",
] as const;

export function posLabel(t: (key: never) => string, value: string | null | undefined): string {
  if (!value) return "";
  const key = value.trim().toLowerCase();
  if (!(KNOWN as readonly string[]).includes(key)) return value;
  return t(`pos.${key}` as never);
}
