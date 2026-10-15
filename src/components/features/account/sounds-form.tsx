"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { CardBody, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { SOUND_VOLUMES, type Units } from "@/db/enums";
import { sound } from "@/lib/sound";
import type { FormState } from "@/lib/result";
import { updatePreferencesAction } from "@/modules/identity/actions";
import {
  ActionError,
  failedValue,
  SaveButton,
  useActionFieldErrors,
  useSuccessToast,
} from "./form-feedback";

/**
 * Settings → Preferences → Sounds. It posts to the same preferences action as the units form (which is why the current
 * units ride along as a hidden field): one action, one validation, one audit entry.
 */
export function SoundsForm({
  units,
  enabled,
  volume,
}: {
  units: Units;
  enabled: boolean;
  volume: number;
}) {
  const t = useTranslations("settings.preferences");
  const ts = useTranslations("settings");
  const [state, action, pending] = useActionState<FormState, FormData>(
    updatePreferencesAction,
    null,
  );
  const errors = useActionFieldErrors(state);
  useSuccessToast(state, ts("saved"));
  const [on, setOn] = React.useState(enabled ? "on" : "off");
  const [level, setLevel] = React.useState(String(volume));

  return (
    <form action={action} noValidate>
      <input type="hidden" name="units" value={units} />
      <CardBody className="space-y-4">
        <ActionError state={state} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("soundsEnabled")} errors={errors("soundsEnabled")}>
            {(c) => (
              <Select
                {...c}
                name="soundsEnabled"
                value={on}
                onChange={(e) => setOn(e.target.value)}
              >
                <option value="on">{t("on")}</option>
                <option value="off">{t("off")}</option>
              </Select>
            )}
          </Field>
          <Field label={t("soundsVolume")} errors={errors("soundVolume")}>
            {(c) => (
              <Select
                {...c}
                name="soundVolume"
                value={failedValue(state, "soundVolume") ?? level}
                onChange={(e) => setLevel(e.target.value)}
                disabled={on === "off"}
              >
                {SOUND_VOLUMES.map((v) => (
                  <option key={v} value={v}>
                    {t("volumeOption", { percent: v })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {/* a disabled select is not submitted: keep the chosen volume with the form */}
        {on === "off" ? <input type="hidden" name="soundVolume" value={level} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={on === "off" || Number(level) === 0}
            onClick={() => {
              // a click is a user gesture, so this may play even before any other interaction
              sound.unlock();
              sound.play("save", { enabled: true, volume: Number(level) });
            }}
          >
            {t("soundsTest")}
          </Button>
          <p className="text-sm text-ink-muted">{t("soundsHint")}</p>
        </div>
      </CardBody>
      <CardFooter>
        <SaveButton pending={pending} />
      </CardFooter>
    </form>
  );
}
