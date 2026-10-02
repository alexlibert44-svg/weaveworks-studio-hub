import { Check, ChevronDown } from "lucide-react";
import * as Flags from "country-flag-icons/react/3x2";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { language, type LanguageMeta } from "@/lib/i18n/languages";
import { cn } from "@/lib/utils";

// Arabic is a language spoken across many countries: it gets no national flag.
const COUNTRY: Record<string, keyof typeof Flags> = {
  en: "GB", fr: "FR", es: "ES", de: "DE", it: "IT", pt: "PT",
  nl: "NL", tr: "TR", ru: "RU", uk: "UA", pl: "PL", sv: "SE", el: "GR",
  he: "IL", fa: "IR", ur: "PK", hi: "IN", id: "ID", vi: "VN", th: "TH",
  ja: "JP", ko: "KR", zh: "CN",
};

export function LanguageFlag({ code }: { code: string }) {
  const key = COUNTRY[code];
  if (!key) return <span aria-hidden="true" className="h-[18px] w-[27px] shrink-0" />;
  const Icon = Flags[key];
  return (
    <span aria-hidden="true" className="flex h-[18px] w-[27px] shrink-0 overflow-hidden rounded-[3px] ring-1 ring-foreground/15 shadow-sm">
      <Icon className="block h-full w-full object-cover" />
    </span>
  );
}

export function LanguageSelector({ label, value, languages, onChange, disabled, inFrame = false }: {
  label: string;
  value: string;
  languages: LanguageMeta[];
  onChange: (code: string) => void;
  disabled?: boolean;
  inFrame?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const show = () => {
    const rect = button.current?.getBoundingClientRect();
    if (rect) {
      const height = Math.min(400, window.innerHeight * 0.65);
      setPosition({
        top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12)),
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 252)),
      });
    }
    setOpen(true);
  };

  return (
    <div className={cn("min-w-0", inFrame ? "w-fit max-w-full" : "w-full")}>
      {!inFrame && <span className="mb-1.5 block text-sm font-semibold">{label}</span>}
      <Button
        ref={button}
        type="button"
        variant={inFrame ? "ghost" : "secondary"}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => open ? setOpen(false) : show()}
        disabled={disabled}
        className={cn("h-11 max-w-full gap-2 px-3", inFrame
          ? "border border-hero-foreground/40 bg-hero-foreground/15 text-hero-foreground shadow-card backdrop-blur-sm hover:bg-hero-foreground/25 hover:text-hero-foreground"
          : "w-full justify-start")}
      >
        <LanguageFlag code={value} />
        <span className="min-w-0 flex-1 truncate text-start" dir="auto">{language(value).native}</span>
        <ChevronDown className="size-4 shrink-0" />
      </Button>
      {open && createPortal(
        <div className="fixed inset-0 z-50 touch-none" onPointerDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }} onTouchMove={(event) => {
          if (event.target === event.currentTarget) event.preventDefault();
        }}>
          <div
            id={id}
            role="listbox"
            aria-label={label}
            style={{ top: position.top, left: position.left }}
            className="fixed z-10 w-60 max-w-[calc(100vw-1.5rem)] max-h-[min(25rem,65dvh,calc(100dvh-1.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-card touch-pan-y [-webkit-overflow-scrolling:touch]"
          >
            {languages.map((item) => (
              <Button
                key={item.code}
                type="button"
                role="option"
                aria-selected={item.code === value}
                variant="ghost"
                onClick={() => { setOpen(false); if (item.code !== value) onChange(item.code); }}
                className="min-h-11 w-full justify-start gap-2 px-3 text-foreground hover:bg-secondary"
              >
                <LanguageFlag code={item.code} />
                <span className="min-w-0 flex-1 truncate text-start" dir="auto">{item.native}</span>
                {item.code === value && <Check className="size-4 shrink-0 text-primary-deep" />}
              </Button>
            ))}
          </div>
        </div>, document.body
      )}
    </div>
  );
}