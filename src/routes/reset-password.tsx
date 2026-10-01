import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { PasswordInput, authErrorKey } from "@/components/verba/PasswordInput";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — LingoFlow" },
      { name: "description", content: "Choose a new password for your LingoFlow account." },
      { property: "og:title", content: "Set a new password — LingoFlow" },
      { property: "og:description", content: "Reset your LingoFlow password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setReady(true);
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    void supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("auth.mismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(t(authErrorKey(err) as Parameters<typeof t>[0]));
    else {
      setDone(true);
      setTimeout(() => void navigate({ to: "/", replace: true }), 1200);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <h1 dir="ltr" className="w-fit text-2xl font-bold text-primary">LingoFlow</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t("auth.newPasswordTitle")}</p>
      {!ready ? (
        <p className="card-surface p-5 text-sm text-muted-foreground">{t("auth.invalidLink")}</p>
      ) : (
        <form onSubmit={submit} className="card-surface space-y-4 p-5">
          <div>
            <label htmlFor="pw" className="mb-1.5 block text-sm font-semibold">{t("auth.newPassword")}</label>
            <PasswordInput id="pw" required minLength={6} dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="h-11" />
          </div>
          <div>
            <label htmlFor="pw2" className="mb-1.5 block text-sm font-semibold">{t("auth.confirmPassword")}</label>
            <PasswordInput id="pw2" required minLength={6} dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className="h-11" />
          </div>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          {done ? <p className="rounded-xl bg-primary-soft p-3 text-sm text-primary-deep">{t("auth.passwordUpdated")}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy || done}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("auth.savePassword")}
          </Button>
        </form>
      )}
    </div>
  );
}
