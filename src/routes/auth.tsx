import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — LingoFlow" },
      { name: "description", content: "Sign in or create your LingoFlow account to keep your words and progress." },
      { property: "og:title", content: "Sign in — LingoFlow" },
      { property: "og:description", content: "Your words and learning progress, saved to your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void navigate({ to: "/", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name.trim() || undefined },
          },
        });
        if (err) throw err;
        if (!data.session) setNotice(t("auth.checkEmail"));
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err) throw err;
        setNotice(t("auth.resetSent"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError(result.error.message ?? String(result.error));
      return;
    }
    if (result.redirected) return;
    // Popup flow: the session is already set; go straight into the app.
    void navigate({ to: "/", replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="bg-hero-gradient relative overflow-hidden rounded-b-4xl px-6 pt-12 pb-10 text-hero-foreground">
        <div aria-hidden className="pointer-events-none absolute -end-14 -top-16 size-52 rounded-full bg-hero-circle-blue opacity-30" />
        <div aria-hidden className="pointer-events-none absolute -start-10 bottom-0 size-32 rounded-full bg-hero-circle-purple opacity-25" />
        <div className="relative z-10 mx-auto max-w-md">
          <h1 dir="ltr" className="w-fit text-3xl font-bold">LingoFlow</h1>
          <p className="mt-2 text-sm text-hero-foreground/90">
            {mode === "signup" ? t("auth.signupSubtitle") : mode === "forgot" ? t("auth.forgotSubtitle") : t("auth.signinSubtitle")}
          </p>
        </div>
      </div>

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-6">
        {mode !== "forgot" ? (
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-secondary p-1" role="tablist">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setNotice(null);
                }}
                className={cn(
                  "rounded-xl py-2 text-sm font-semibold transition-colors",
                  mode === m ? "bg-primary-soft text-primary-deep" : "text-foreground hover:bg-card",
                )}
              >
                {m === "signin" ? t("auth.signin") : t("auth.signup")}
              </button>
            ))}
          </div>
        ) : null}

        <form onSubmit={submit} className="card-surface space-y-4 p-5">
          {mode === "signup" ? (
            <Field label={t("auth.name")} id="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="h-11" />
            </Field>
          ) : null}
          <Field label={t("auth.email")} id="email">
            <Input id="email" type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="h-11" />
          </Field>
          {mode !== "forgot" ? (
            <Field label={t("auth.password")} id="password">
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="h-11"
              />
            </Field>
          ) : null}

          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          {notice ? <p className="rounded-xl bg-primary-soft p-3 text-sm text-primary-deep">{notice}</p> : null}

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "signin" ? t("auth.signin") : mode === "signup" ? t("auth.createAccount") : t("auth.sendReset")}
          </Button>

          {mode === "signin" ? (
            <button type="button" className="w-full text-center text-sm font-semibold text-primary" onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}>
              {t("auth.forgot")}
            </button>
          ) : mode === "forgot" ? (
            <button type="button" className="w-full text-center text-sm font-semibold text-primary" onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>
              {t("auth.backToSignin")}
            </button>
          ) : null}
        </form>

        {mode !== "forgot" ? (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {t("auth.or")}
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => void google()}>
              {t("auth.google")}
            </Button>
          </>
        ) : null}
      </main>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
