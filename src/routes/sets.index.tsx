import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Layers, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetsPage,
});

function SetsPage() {
  const { deviceId, learner } = useLearner();
  const { t } = useI18n();

  const { data: sets } = useQuery({
    queryKey: ["sets", deviceId, learner.learning_language],
    queryFn: () => listSets(deviceId, learner.learning_language),
  });
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  // Case/diacritic-insensitive partial match on the set name; works for Arabic too.
  const fold = (v: string) => v.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
  const shown = useMemo(() => {
    const q = fold(query);
    return !sets || !q ? sets : sets.filter((s) => fold(s.name).includes(q) || (s.terms ?? []).some((w) => fold(w).includes(q)));
  }, [sets, query]);
  const closeSearch = () => {
    setQuery("");
    setSearching(false);
  };

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-3">
        <PageTitle title={t("sets.title")} subtitle={t("sets.subtitle")} />
        {sets && sets.length > 0 ? (
          <Button
            variant="secondary"
            size="icon"
            className="shrink-0 rounded-full"
            aria-label={searching ? t("sets.clearSearch") : t("sets.search")}
            onClick={() => (searching ? closeSearch() : setSearching(true))}
          >
            {searching ? <X className="size-5" /> : <Search className="size-5" />}
          </Button>
        ) : null}
      </div>
      {searching ? (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            type="text"
            inputMode="search"
            dir="auto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("sets.searchPlaceholder")}
            aria-label={t("sets.search")}
            className="h-11 rounded-2xl ps-9 pe-10"
          />
          {query ? (
            <Button
              variant="ghost"
              size="icon"
              className="absolute end-1 top-1/2 size-9 -translate-y-1/2 rounded-full"
              aria-label={t("sets.clearSearch")}
              onClick={() => setQuery("")}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : null}

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
      ) : shown && shown.length === 0 ? (
        <p className="card-surface p-6 text-center text-sm text-muted-foreground" role="status">
          {t("sets.noMatches")}
        </p>
      ) : (
        <ul className="space-y-3">
          {(shown ?? sets).map((set) => (
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
                      <span className="text-xs font-semibold text-primary">
                        {t("sets.totalItems", { count: set.wordCount + set.formCount })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("sets.splitCounts", { words: set.wordCount, forms: set.formCount })}
                    </p>
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
