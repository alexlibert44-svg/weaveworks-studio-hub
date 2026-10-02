import { Link } from "@tanstack/react-router";
import { Crown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PREMIUM_ENABLED } from "@/lib/verba/plan";

/** Small gold crown marking Premium. */
export function PremiumCrown({ className }: { className?: string }) {
  if (!PREMIUM_ENABLED) return null;
  return <Crown aria-hidden="true" className={cn("size-4 shrink-0 fill-premium/25 text-premium", className)} />;
}

/** Upgrade message shown instead of a Premium feature for Free users. */
export function PremiumGate({ body, title, onClose, className }: { body: string; title?: string; onClose?: () => void; className?: string }) {
  const { t } = useI18n();
  return (
    <div role="alert" className={cn("card-surface w-full p-5 text-center", className)}>
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-premium-soft">
        <PremiumCrown className="size-5" />
      </span>
      <p className="mt-3 text-base font-bold">{title ?? t("premium.feature")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <Button asChild size="lg" className="mt-4 w-full rounded-2xl">
        <Link to="/premium">
          <PremiumCrown /> {t("premium.upgradeCta")}
        </Link>
      </Button>
      {onClose ? (
        <Button variant="ghost" className="mt-2 w-full rounded-2xl" onClick={onClose}>
          {t("premium.notNow")}
        </Button>
      ) : null}
    </div>
  );
}
