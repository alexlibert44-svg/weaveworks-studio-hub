import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, Flame, Loader2, Pencil, Settings, User } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { getProfileStats, updateLearner } from "@/lib/verba/api";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — LingoFlow" },
      { name: "description", content: "Your LingoFlow profile and real learning progress: words, mastered words and streaks." },
      { property: "og:title", content: "Profile — LingoFlow" },
      { property: "og:description", content: "Your picture, name and real learning progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { deviceId, learner, refresh } = useLearner();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(learner.display_name ?? "");
  const [photoError, setPhotoError] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: stats } = useQuery({
    queryKey: ["stats", deviceId],
    queryFn: () => getProfileStats(deviceId),
  });

  const avatarPath = learner.avatar_path ?? null;
  const { data: avatarUrl } = useQuery({
    queryKey: ["avatar", avatarPath],
    enabled: !!avatarPath,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("avatars").createSignedUrl(avatarPath!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const saveName = useMutation({
    mutationFn: () => updateLearner(deviceId, { display_name: name.trim() || "Learner" }),
    onSuccess: async () => {
      await refresh();
      setEditing(false);
    },
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${deviceId}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (error) throw error;
      await updateLearner(deviceId, { avatar_path: path });
      if (avatarPath) void supabase.storage.from("avatars").remove([avatarPath]);
    },
    onMutate: () => setPhotoError(false),
    onError: () => setPhotoError(true),
    onSuccess: refresh,
  });

  return (
    <AppShell>
      <header className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{t("profile.title")}</h1>
        <Button asChild variant="ghost" size="icon" aria-label={t("profile.openSettings")}>
          <Link to="/settings">
            <Settings className="size-5" />
          </Link>
        </Button>
      </header>

      <section className="card-surface flex flex-col items-center p-6 text-center animate-rise">
        <div className="relative">
          <div className="grid size-24 place-items-center overflow-hidden rounded-full bg-secondary text-primary">
            {avatarUrl ? (
              <img src={avatarUrl} alt={learner.display_name} className="size-full object-cover" />
            ) : (
              <User className="size-10" />
            )}
          </div>
          {editing ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label={t("profile.changePhoto")}
              className="absolute -bottom-1 -end-1 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow"
            >
              {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            </button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
        </div>

        {editing ? (
          <div className="mt-5 w-full">
            <label className="sr-only" htmlFor="display-name">{t("profile.nameLabel")}</label>
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl text-center"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => { setName(learner.display_name ?? ""); setEditing(false); }}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => saveName.mutate()} disabled={saveName.isPending}>
                {t("common.save")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-4 text-xl font-semibold">{learner.display_name}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> {t("profile.edit")}
            </Button>
          </>
        )}
        {photoError ? <p className="mt-3 text-sm text-destructive">{t("profile.photoError")}</p> : null}
      </section>

      <h2 className="mt-6 mb-3 text-lg font-bold">{t("profile.stats")}</h2>
      <ul className="grid grid-cols-2 gap-2.5">
        <StatCard label={t("profile.statWords")} value={stats?.totalWords ?? 0} />
        <StatCard label={t("profile.statLearning")} value={stats?.learningWords ?? 0} />
        <StatCard label={t("profile.statMastered")} value={stats?.masteredWords ?? 0} />
        <StatCard
          label={t("profile.statStreak")}
          value={learner.streak}
          icon={<Flame className="size-4 text-accent" />}
        />
        <StatCard label={t("profile.statLongest")} value={learner.longest_streak} />
      </ul>
    </AppShell>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
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
