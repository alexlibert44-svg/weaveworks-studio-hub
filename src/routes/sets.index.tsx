import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Layers, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell, PageTitle } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { StatePill } from "@/components/verba/MasteryPill";
import { useI18n } from "@/lib/i18n";
import { listSets } from "@/lib/verba/api";

export const Route = createFileRoute("/sets/")({
  head: () => ({
    meta: [
      { title: "My Sets — LingoFlow" },
      {
        name: "description",
        content:
          "Your vocabulary library: every word set with its word count, mastery and reviews due.",
      },
      { property: "og:title", content: "My Sets — LingoFlow" },
      {
        property: "og:description",
        content: "Browse the word sets you created and jump straight into practice.",
      },
    ],
  }),
  component: SetsPage,
});

function SetsPage() {
  const { deviceId } = useLearner();
  const { t } = useI18n();

  const { data: sets } = useQuery({
    queryKey: ["sets", deviceId],
    queryFn: () => listSets(deviceId),
  });

  return (
    <AppShell>
      <PageTitle title={t("sets.title")} subtitle={t("sets.subtitle")} />

      {sets === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : sets.length === 0 ? (
        <div className="card-surface p-7 text-center">
          <Layers className="mx-auto size-7 text-primary" />
          <p className="mt-3 text-sm font-semibold">{t("sets.empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("sets.emptyHint")}</p>
          <Button asChild className="mt-4 rounded-xl">
            <Link to="/add">
              <Plus className="size-4" /> {t("sets.new")}
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {sets.map((set) => (
            <li key={set.id}>
              <Link
                to="/sets/$setId"
                params={{ setId: set.id }}
                className="card-surface animate-rise block p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold">{set.name}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <StatePill state={set.status} />
                      <span className="text-xs text-muted-foreground">
                        {t("sets.wordCount", { count: set.wordCount })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {sets && sets.length > 0 ? (
        <Button asChild variant="secondary" className="mt-5 w-full rounded-2xl">
          <Link to="/add">
            <Plus className="size-4" /> {t("sets.new")}
          </Link>
        </Button>
      ) : null}
    </AppShell>
  );
}
