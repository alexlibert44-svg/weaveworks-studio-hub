import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Flame, Languages } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AppShell, PageTitle } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES, TARGET_LANGUAGES, type LanguageMeta } from "@/lib/i18n/languages";
import { getProfileStats, updateLearner } from "@/lib/verba/api";
import type { Learner } from "@/lib/verba/types";

const GOALS = [5, 10, 15, 30];

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — LingoFlow" },
      {
        name: "description",
        content:
          "Your languages, daily goal and real progress: words learned, mastery and your streak.",
      },
      { property: "og:title", content: "Profile — LingoFlow" },
      {
        property: "og:description",
        content: "Change your languages and daily goal, and see your real progress.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { deviceId, learner, refresh } = useLearner();
  const { t } = useI18n();
  const [name, setName] = useState(learner.display_name ?? "");

  const { data: stats } = useQuery({
    queryKey: ["stats", deviceId],
    queryFn: () => getProfileStats(deviceId),
  });

  const save = useMutation({
    mutationFn: (patch: Partial<Omit<Learner, "device_id">>) => updateLearner(deviceId, patch),
    onSuccess: refresh,
  });

  return (
    <AppShell>
      <PageTitle title={t("profile.title")} />

      <div className="card-surface p-5">
        <label className="text-sm font-semibold" htmlFor="display-name">
          {t("profile.nameLabel")}
        </label>
        <div className="mt-2 flex gap-2">
          <Input
            id="display-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 rounded-xl"
          />
          <Button
            className="h-11 rounded-xl"
            onClick={() => save.mutate({ display_name: name.trim() })}
            disabled={save.isPending}
          >
            {t("common.save")}
          </Button>
        </div>
      </div>

      <h2 className="mt-6 mb-3 flex items-center gap-2 text-lg font-bold">
        <Languages className="size-4 text-primary" /> {t("profile.languages")}
      </h2>
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

      <h2 className="mt-6 mb-3 text-lg font-bold">{t("profile.goal")}</h2>
      <ul className="grid grid-cols-4 gap-2">
        {GOALS.map((minutes) => (
          <li key={minutes}>
            <button
              type="button"
              onClick={() => save.mutate({ daily_goal_minutes: minutes })}
              aria-pressed={learner.daily_goal_minutes === minutes}
              className={
                learner.daily_goal_minutes === minutes
                  ? "w-full rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground"
                  : "w-full rounded-2xl bg-card py-3 text-sm font-semibold text-foreground shadow-card"
              }
            >
              {minutes} {t("common.minutesShort")}
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mt-6 mb-3 text-lg font-bold">{t("profile.settings")}</h2>
      <div className="card-surface divide-y divide-border">
        <div className="flex items-center justify-between p-4">
          <span className="text-sm font-semibold">{t("profile.audio")}</span>
          <Switch
            checked={learner.audio_autoplay}
            onCheckedChange={(checked) => save.mutate({ audio_autoplay: checked })}
            aria-label={t("profile.audio")}
          />
        </div>
        <div className="flex items-center justify-between p-4">
          <span className="text-sm font-semibold">{t("profile.notifications")}</span>
          <Switch
            checked={learner.notifications_enabled}
            onCheckedChange={(checked) => save.mutate({ notifications_enabled: checked })}
            aria-label={t("profile.notifications")}
          />
        </div>
      </div>

      <h2 className="mt-6 mb-3 text-lg font-bold">{t("profile.stats")}</h2>
      <ul className="grid grid-cols-2 gap-2.5">
        <StatCard label={t("profile.statWords")} value={stats?.totalWords ?? 0} />
        <StatCard label={t("profile.statMastered")} value={stats?.masteredWords ?? 0} />
        <StatCard label={t("common.mastery")} value={`${stats?.overallMastery ?? 0}%`} />
        <StatCard
          label={t("profile.statStreak")}
          value={learner.streak}
          icon={<Flame className="size-4 text-accent" />}
        />
        <StatCard label={t("profile.statLongest")} value={learner.longest_streak} />
      </ul>

      <p className="mt-5 text-center text-xs text-muted-foreground">{t("profile.deviceNote")}</p>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <li className="card-surface p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </li>
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
        className="mt-1.5 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold"
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
