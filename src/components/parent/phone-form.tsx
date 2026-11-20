"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/(parent)/actions";
import { Field, inputClass, Notice } from "@/components/ui/bits";
import { SubmitButton } from "@/components/ui/submit-button";
import { t } from "@/lib/strings";

export function PhoneForm({ askAdmissionNo }: { askAdmissionNo: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  return (
    <form action={action} className="space-y-4" noValidate data-keep-visible>
      {state.error ? (
        <Notice kind="bad" role="alert">
          {state.error}
        </Notice>
      ) : null}
      <Field label={t.landing.phoneLabel} hint={t.landing.phoneHelp} htmlFor="phone">
        <div className="flex items-stretch gap-2">
          <span
            aria-hidden="true"
            className="grid min-h-12 place-items-center rounded-2xl border-2 border-line bg-sunshine-soft px-3 text-lg font-bold"
          >
            +91
          </span>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="go"
            required
            maxLength={20}
            defaultValue={state.phone ?? ""}
            placeholder="98765 43210"
            aria-describedby="phone-hint"
            className={inputClass}
          />
        </div>
      </Field>
      {askAdmissionNo ? (
        <Field label={t.landing.admissionLabel} hint={t.landing.admissionHelp} htmlFor="admissionNo">
          <input
            id="admissionNo"
            name="admissionNo"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            enterKeyHint="go"
            required
            maxLength={30}
            aria-describedby="admissionNo-hint"
            className={inputClass}
          />
        </Field>
      ) : null}
      <SubmitButton size="lg" full pending={pending}>
        {t.landing.go} <span aria-hidden="true">→</span>
      </SubmitButton>
    </form>
  );
}
