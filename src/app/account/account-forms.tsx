"use client";

import { useActionState } from "react";
import { changePasswordAction, updateProfileAction, type AccountState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";

const initialState: AccountState = {};

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, initialState);
  return <form action={action} className="editor-form" noValidate>
    {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
    {state.success ? <StatusMessage tone="success">{state.success}</StatusMessage> : null}
    <div className="form-field"><label className="form-field__label" htmlFor="display-name">Ім’я у кабінеті</label><input id="display-name" name="displayName" defaultValue={displayName} required /></div>
    <Button type="submit" busy={pending}>Зберегти ім’я</Button>
  </form>;
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initialState);
  return <form action={action} className="editor-form" noValidate>
    {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
    {state.success ? <StatusMessage tone="success">{state.success}</StatusMessage> : null}
    <div className="form-field"><label className="form-field__label" htmlFor="new-password">Новий пароль</label><input id="new-password" name="password" type="password" minLength={12} autoComplete="new-password" required /><p className="form-field__hint">Щонайменше 12 символів. Можна вставити пароль із менеджера паролів.</p></div>
    <div className="form-field"><label className="form-field__label" htmlFor="password-confirmation">Повторіть пароль</label><input id="password-confirmation" name="passwordConfirmation" type="password" minLength={12} autoComplete="new-password" required /></div>
    <Button type="submit" busy={pending}>Змінити пароль</Button>
  </form>;
}
