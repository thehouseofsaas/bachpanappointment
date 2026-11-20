"use client";

import { useActionState } from "react";
import { setupOwner, signInAdmin, type AuthState } from "@/app/admin/(auth)/actions";
import { Notice } from "@/components/ui/bits";
import { SubmitButton } from "@/components/ui/submit-button";

const input =
  "block w-full min-h-12 rounded-xl border-2 border-line bg-paper px-3 text-base focus:border-grape focus:outline-none";
const label = "mb-1 block text-sm font-bold";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(signInAdmin, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <Notice kind="bad" role="alert">
          {state.error}
        </Notice>
      ) : null}
      <div>
        <label htmlFor="username" className={label}>
          Username
        </label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" required defaultValue={state.username ?? ""} className={input} />
      </div>
      <div>
        <label htmlFor="password" className={label}>
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={input} />
      </div>
      <SubmitButton full pending={pending}>
        Sign in
      </SubmitButton>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(setupOwner, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <Notice kind="bad" role="alert">
          {state.error}
        </Notice>
      ) : null}
      <div>
        <label htmlFor="token" className={label}>
          Setup code
        </label>
        <input id="token" name="token" type="password" autoComplete="off" required className={input} />
        <p className="mt-1 text-sm text-muted">The SETUP_TOKEN value from the hosting settings.</p>
      </div>
      <div>
        <label htmlFor="name" className={label}>
          Your name
        </label>
        <input id="name" name="name" autoComplete="name" required className={input} />
      </div>
      <div>
        <label htmlFor="username" className={label}>
          Username
        </label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" required defaultValue={state.username ?? ""} className={input} />
      </div>
      <div>
        <label htmlFor="password" className={label}>
          Password (10 characters or more)
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className={input} />
      </div>
      <SubmitButton full pending={pending}>
        Create owner account
      </SubmitButton>
    </form>
  );
}
