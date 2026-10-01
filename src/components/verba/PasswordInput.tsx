import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Password field with an accessible show/hide toggle; the value is never touched. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative" dir="ltr">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pe-11", className)} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
        aria-pressed={visible}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-xl text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Maps a real auth error to a translation key; unknown errors keep a generic key. */
export function authErrorKey(err: unknown): string {
  const e = err as { code?: string; message?: string; status?: number; name?: string } | null;
  const code = e?.code ?? "";
  const msg = (e?.message ?? String(err ?? "")).toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "auth.errInvalid";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "auth.errUnconfirmed";
  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered")) return "auth.errExists";
  if (code === "weak_password" || msg.includes("password should") || msg.includes("weak")) return "auth.errWeak";
  if (code === "email_address_invalid" || code === "validation_failed" || msg.includes("invalid email") || msg.includes("unable to validate email")) return "auth.errEmail";
  if (code.startsWith("over_") || e?.status === 429 || msg.includes("rate limit")) return "auth.errRate";
  if (code === "user_banned" || msg.includes("banned")) return "auth.errDisabled";
  if (e?.name === "AuthRetryableFetchError" || msg.includes("failed to fetch") || msg.includes("network")) return "auth.errNetwork";
  return "auth.errOther";
}
