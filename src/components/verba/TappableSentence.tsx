import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { language } from "@/lib/i18n/languages";
import { cn } from "@/lib/utils";
import { getWordGlosses, type WordGloss } from "@/lib/verba/gloss.functions";
import type { Sentence } from "@/lib/verba/types";

const clean = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, "");

/**
 * The target-language exercise sentence with every word tappable. A tap shows
 * that word's meaning in context, in the learner's language, in a small
 * bubble. The blank (the answer) is never tappable and nothing else is revealed.
 */
export function TappableSentence({
  text,
  sentence,
  locale,
}: {
  text: string;
  sentence: Sentence;
  locale: string;
}) {
  const { t, native } = useI18n();
  const glossFn = useServerFn(getWordGlosses);
  const [open, setOpen] = useState<number | null>(null);
  const [glosses, setGlosses] = useState<WordGloss[] | null>(
    (sentence as Sentence & { word_glosses?: WordGloss[] | null }).word_glosses ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const tokens = text.split(/(\s+)/);

  const load = async () => {
    if (glosses || loading) return;
    setLoading(true);
    setError(false);
    try {
      const result = await glossFn({
        data: {
          sentenceId: sentence.id,
          targetLanguage: language(locale.split("-")[0] ?? locale).english,
          nativeLanguage: native.english,
        },
      });
      setGlosses(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const meaningFor = (tokenIndex: number): string | null => {
    if (!glosses) return null;
    const word = clean(tokens[tokenIndex] ?? "");
    const wordPos = tokens.slice(0, tokenIndex).filter((x) => x.trim() && !x.includes("____")).length;
    const matches = glosses.filter((g) => clean(g.word) === word);
    if (matches.length === 0) return null;
    // Prefer the gloss at the same position when a word repeats.
    const byPos = glosses[wordPos];
    return (byPos && clean(byPos.word) === word ? byPos : matches[0])!.meaning;
  };

  return (
    <div ref={ref}>
      <p className="text-lg leading-loose font-semibold" lang={locale} dir="auto">
        {tokens.map((token, index) => {
          if (!token.trim() || token.includes("____") || !clean(token)) {
            return <span key={index}>{token}</span>;
          }
          const active = open === index;
          return (
            <span key={index} className="relative inline-block">
              <button
                type="button"
                onClick={() => {
                  setOpen(active ? null : index);
                  void load();
                }}
                aria-expanded={active}
                className={cn(
                  "rounded-lg px-0.5 underline decoration-primary/30 decoration-dotted underline-offset-4 transition",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-primary-soft",
                )}
              >
                {token}
              </button>
              {active ? (
                <span
                  role="status"
                  lang={native.code}
                  className="absolute start-0 top-full z-20 mt-1 w-max max-w-[14rem] rounded-xl border border-border bg-popover px-3 py-1.5 text-sm font-semibold whitespace-normal text-primary-deep shadow-card"
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : error ? (
                    <button type="button" className="text-destructive" onClick={() => void load()}>
                      {t("audio.retry")}
                    </button>
                  ) : (
                    (meaningFor(index) ?? t("train.noMeaning"))
                  )}
                </span>
              ) : null}
            </span>
          );
        })}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t("train.tapForHint")}</p>
    </div>
  );
}
