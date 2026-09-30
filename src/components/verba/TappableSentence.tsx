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
 * The learner's-language translation with every word tappable. A tap shows the
 * matching target-language word(s) in context, in a small bubble. A match that
 * would give away the writing answer is withheld; nothing else is revealed.
 */
export function TappableSentence({
  text,
  sentence,
  locale,
  hidden,
}: {
  text: string;
  sentence: Sentence;
  /** Target-language speech locale. */
  locale: string;
  /** The writing answer: never shown. */
  hidden?: string | null;
}) {
  const { t, native } = useI18n();
  const glossFn = useServerFn(getWordGlosses);
  const [open, setOpen] = useState<number | null>(null);
  const [glosses, setGlosses] = useState<WordGloss[] | null>(() => {
    const saved = (sentence as Sentence & { word_glosses?: unknown }).word_glosses as
      | { v?: number; words?: WordGloss[] }
      | null
      | undefined;
    return saved && saved.v === 2 && Array.isArray(saved.words) ? saved.words : null;
  });
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
    const wordPos = tokens.slice(0, tokenIndex).filter((x) => x.trim() && clean(x)).length;
    const matches = glosses.filter((g) => clean(g.word) === word);
    if (matches.length === 0) return null;
    // Prefer the gloss at the same position when a word repeats.
    const byPos = glosses[wordPos];
    return (byPos && clean(byPos.word) === word ? byPos : matches[0])!.meaning ?? null;
  };

  return (
    <div ref={ref}>
      <p className="text-base leading-loose font-medium text-muted-foreground" lang={native.code} dir="auto">
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
                  className="absolute start-0 top-full z-20 mt-1 w-max max-w-[14rem] rounded-xl border border-border bg-popover px-3 py-1.5 text-sm font-semibold whitespace-normal text-primary-deep shadow-card"
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : error ? (
                    <button type="button" className="text-destructive" onClick={() => void load()}>
                      {t("audio.retry")}
                    </button>
                  ) : (
                    (() => {
                      const match = meaningFor(index);
                      if (!match) return t("train.noMeaning");
                      if (hidden && clean(match).includes(clean(hidden))) return t("train.answerHidden");
                      return <span lang={locale.split("-")[0]} dir="auto">{match}</span>;
                    })()
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
