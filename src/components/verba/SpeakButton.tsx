import { Loader2, RotateCcw, Volume2 } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { playSpeech } from "@/lib/verba/speech";

/** Audio button with genuine loading, playing and failure/retry states. */
export function SpeakButton({
  text,
  locale,
  label,
  ...props
}: { text: string; locale: string; label: string } & Omit<ComponentProps<typeof Button>, "onClick">) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");

  const play = async () => {
    setState("loading");
    try {
      const done = playSpeech(text, locale);
      setState("playing");
      await done;
      setState("idle");
    } catch {
      setState("error");
    }
  };

  return (
    <Button
      {...props}
      onClick={() => void play()}
      disabled={state === "loading" || props.disabled}
      aria-live="polite"
      className={[props.className, state === "error" ? "text-destructive" : ""].join(" ")}
    >
      {state === "loading" ? (
        <Loader2 className="size-4 animate-spin" />
      ) : state === "error" ? (
        <RotateCcw className="size-4" />
      ) : (
        <Volume2 className={state === "playing" ? "size-4 animate-pulse" : "size-4"} />
      )}
      {state === "error" ? t("audio.retry") : label}
    </Button>
  );
}
