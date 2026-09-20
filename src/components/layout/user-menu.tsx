"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { authClient } from "@/modules/identity/client";

export function UserMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [signingOut, setSigningOut] = React.useState(false);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Menu>
      <MenuTrigger
        aria-label={t("accountMenu")}
        className="flex h-11 items-center gap-2 rounded-md px-1.5 pr-2 hover:bg-surface-sunken data-[state=open]:bg-surface-sunken"
      >
        <Avatar name={name} />
        <span className="hidden max-w-32 truncate text-sm font-medium text-ink sm:block">
          {name}
        </span>
        <ChevronDown className="hidden size-4 text-ink-muted sm:block" aria-hidden />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>
          <span className="block eyebrow">{t("signedInAs")}</span>
          <span className="mt-1 block truncate text-sm font-semibold text-ink">{name}</span>
          <span className="block truncate text-sm text-ink-muted">{email}</span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/settings/profile">
            <UserRound className="size-4 text-ink-muted" aria-hidden />
            {t("profile")}
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/settings/security">
            <ShieldCheck className="size-4 text-ink-muted" aria-hidden />
            {t("security")}
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/settings/preferences">
            <SlidersHorizontal className="size-4 text-ink-muted" aria-hidden />
            {t("preferences")}
          </Link>
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          disabled={signingOut}
          onSelect={(e) => {
            e.preventDefault();
            void signOut();
          }}
        >
          <LogOut className="size-4 text-ink-muted" aria-hidden />
          {signingOut ? t("signingOut") : t("signOut")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
