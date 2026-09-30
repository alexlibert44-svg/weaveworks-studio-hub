import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AppShell, PageTitle } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES, TARGET_LANGUAGES, type LanguageMeta } from "@/lib/i18n/languages";
import { updateLearner } from "@/lib/verba/api";
import type { Learner } from "@/lib/verba/types";

const GOALS = [5, 10, 15, 30];

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — LingoFlow" },
      { name: "description", content: "Account, languages, daily goal, audio and reminder preferences for LingoFlow." },
      { property: "og:title", content: "Settings — LingoFlow" },
      { property: "og:description", content: "Choose your languages, daily goal, audio and reminders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

function SettingsPage() {
  const { deviceId, email, learner, refresh } = useLearner();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const save = useMutation({
    mutationFn: (patch: Partial<Omit<Learner, "device_id">>) => updateLearner(deviceId, patch),
    onSuccess: refresh,
  });

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  };

  return (
    <AppShell>
      <PageTitle title={t("settings.title")} />

      <Section title={t("settings.account")}>
        <div className="card-surface divide-y divide-border">
          <Link to="/profile" className="flex items-center justify-between p-4 text-sm font-semibold">
            {t("settings.editProfile")}
            <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
          </Link>
          <div className="p-4">
            <p className="text-xs text-muted-foreground">{t("auth.signedInAs")}</p>
            <p className="mt-0.5 truncate text-sm font-semibold" dir="ltr">{email}</p>
            <Button variant="secondary" className="mt-4 w-full" onClick={() => void signOut()}>
              <LogOut className="size-4 rtl:rotate-180" /> {t("auth.signout")}
            </Button>
          </div>
        </div>
      </Section>

      <Section title={t("profile.languages")}>
        <div className="card-surface space-y-4 p-5">
          <LanguageSelect
            label={t("profile.native")}
            value={learner.native_language}
            languages={LANGUAGES}
            onChange={(code) => save.mutate({ native_language: code })}
          />
          <LanguageSelect
            label={t("profile.target")}
            value={learner.learning_language}
            languages={TARGET_LANGUAGES}
            onChange={(code) => save.mutate({ learning_language: code })}
          />
          <p className="text-xs text-muted-foreground">{t("profile.targetChangeNote")}</p>
        </div>
      </Section>

      <Section title={t("settings.learning")}>
        <div className="card-surface p-4">
          <p className="mb-3 text-sm font-semibold">{t("profile.goal")}</p>
          <ul className="grid grid-cols-4 gap-2">
            {GOALS.map((minutes) => (
              <li key={minutes}>
                <Button
                  type="button"
                  variant={learner.daily_goal_minutes === minutes ? "default" : "secondary"}
                  onClick={() => save.mutate({ daily_goal_minutes: minutes })}
                  aria-pressed={learner.daily_goal_minutes === minutes}
                  className="w-full px-1"
                >
                  {minutes} {t("common.minutesShort")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title={t("settings.audio")}>
        <div className="card-surface flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t("profile.audio")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("settings.audioHint")}</p>
          </div>
          <Switch
            checked={learner.audio_autoplay}
            onCheckedChange={(checked) => save.mutate({ audio_autoplay: checked })}
            aria-label={t("profile.audio")}
          />
        </div>
      </Section>

      <Section title={t("settings.notifications")}>
        <div className="card-surface flex items-center justify-between p-4">
          <span className="text-sm font-semibold">{t("profile.notifications")}</span>
          <Switch
            checked={learner.notifications_enabled}
            onCheckedChange={(checked) => save.mutate({ notifications_enabled: checked })}
            aria-label={t("profile.notifications")}
          />
        </div>
      </Section>
    </AppShell>
  );
}

function LanguageSelect({
  label,
  value,
  languages,
  onChange,
}: {
  label: string;
  value: string;
  languages: LanguageMeta[];
  onChange: (code: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-semibold">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className="mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm font-semibold text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.native} — {lang.english}
          </option>
        ))}
      </select>
    </div>
  );
}
