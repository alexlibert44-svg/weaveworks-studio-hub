import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { PremiumCrown } from "@/components/verba/Premium";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { usePlan } from "@/lib/verba/plan";

export const Route = createFileRoute("/premium")({
  head: () => ({
    meta: [
      { title: "Premium Plans — LingoFlow" },
      { name: "description", content: "Compare LingoFlow Free, Monthly and Yearly plans." },
      { property: "og:title", content: "Premium Plans — LingoFlow" },
      { property: "og:description", content: "Unlimited word groups, tenses and forms, and AI sentence correction." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PremiumPage,
});

const PREMIUM_FEATURES: MessageKey[] = ["premium.unlimited", "premium.forms", "premium.sentences"];

function PremiumPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { deviceId } = useLearner();
  const { isPremium } = usePlan(deviceId);
  const [notice, setNotice] = useState(false);

  const plans = [
    { id: "free", name: "premium.free", price: "premium.priceFree", features: ["premium.fourPerDay", "premium.reviewFree"] as MessageKey[] },
    { id: "monthly", name: "premium.monthly", price: "premium.priceMonthly", features: PREMIUM_FEATURES },
    { id: "yearly", name: "premium.yearly", price: "premium.priceYearly", features: PREMIUM_FEATURES },
  ] as const;

  return (
    <AppShell>
      <header className="mb-5 flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label={t("common.back")} onClick={() => router.history.back()}>
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <PremiumCrown className="size-6" /> {t("premium.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("premium.subtitle")}</p>
        </div>
      </header>

      <ul className="space-y-3">
        {plans.map((plan) => {
          const yearly = plan.id === "yearly";
          const current = plan.id === "free" ? !isPremium : false;
          return (
            <li key={plan.id} className={cn("card-surface p-5", yearly && "border-2 border-premium")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                    {plan.id !== "free" ? <PremiumCrown /> : null}
                    {t(plan.name)}
                  </p>
                  <p className="mt-1 text-2xl font-bold" dir="ltr">{t(plan.price)}</p>
                </div>
                {yearly ? (
                  <span className="rounded-full bg-premium-soft px-3 py-1 text-xs font-bold text-foreground">{t("premium.save")}</span>
                ) : null}
              </div>
              {yearly ? <p className="mt-1 text-xs text-muted-foreground">{t("premium.saveNote")}</p> : null}
              <ul className="mt-4 space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="size-4 shrink-0 text-primary" /> {t(f)}
                  </li>
                ))}
              </ul>
              {plan.id === "free" ? (
                <Button variant="secondary" className="mt-4 w-full rounded-2xl" disabled>
                  {current ? t("premium.current") : t("premium.free")}
                </Button>
              ) : (
                <Button className="mt-4 w-full rounded-2xl" onClick={() => setNotice(true)}>
                  {t("premium.upgrade")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {notice ? (
        <p role="status" className="mt-4 rounded-2xl bg-primary-soft p-4 text-center text-sm font-semibold text-primary-deep">
          {t("premium.comingSoon")}
        </p>
      ) : null}
    </AppShell>
  );
}
