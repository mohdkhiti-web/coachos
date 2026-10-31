"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { SPORT_COOKIE } from "@/lib/sport-pref";
import { SPORT_KEYS, type SportKey } from "@/sports/registry";

function other(key: SportKey): SportKey {
  return SPORT_KEYS[(SPORT_KEYS.indexOf(key) + 1) % SPORT_KEYS.length] ?? key;
}

/** Persists the choice in a cookie the server reads, then sends the coach to that sport's dashboard. */
function applySport(key: SportKey) {
  document.cookie = `${SPORT_COOKIE}=${key}; path=/; max-age=31536000; samesite=lax`;
}

export function SportSwitcher({ initial }: { initial: SportKey }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [current, setCurrent] = React.useState<SportKey>(initial);
  const next = other(current);

  function switchSport() {
    setCurrent(next);
    applySport(next);
    router.push("/dashboard");
    router.refresh();
  }

  const actionLabel = t("sportSwitcher", { sport: t(`sports.${next}`) });

  return (
    <Tooltip label={actionLabel}>
      <Button
        variant="ghost"
        size="sm"
        onClick={switchSport}
        aria-label={actionLabel}
        className="gap-1.5"
      >
        <ArrowRightLeft className="size-4" aria-hidden />
        <span className="max-w-32 truncate">{t(`sports.${current}`)}</span>
      </Button>
    </Tooltip>
  );
}
