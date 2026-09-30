import { Link } from "@tanstack/react-router";
import { Home, Layers, Plus, RotateCcw, User } from "lucide-react";

import { useI18n, type MessageKey } from "@/lib/i18n";

const items = [
  { to: "/", key: "nav.home", icon: Home },
  { to: "/sets", key: "nav.sets", icon: Layers },
  { to: "/add", key: "nav.add", icon: Plus },
  { to: "/review", key: "nav.review", icon: RotateCcw },
  { to: "/profile", key: "nav.profile", icon: User },
] as const satisfies readonly { to: string; key: MessageKey; icon: unknown }[];

export function BottomNav() {
  const { t } = useI18n();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 shadow-float backdrop-blur-lg">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map(({ to, key, icon: Icon }) => {
          const label = t(key);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                aria-label={label}
                className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground transition-colors active:bg-secondary"
                activeOptions={{ exact: to === "/" }}
                activeProps={{ className: "text-primary" }}
              >
                {to === "/add" ? (
                  <span className="bg-accent-gradient -mt-4 flex size-11 items-center justify-center rounded-2xl text-accent-foreground shadow-glow">
                    <Icon className="size-5" strokeWidth={2.6} />
                  </span>
                ) : (
                  <Icon className="size-5" strokeWidth={2.1} />
                )}
                <span className="text-[0.68rem] font-semibold tracking-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
