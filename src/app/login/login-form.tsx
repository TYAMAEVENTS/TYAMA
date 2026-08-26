"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="login-form" noValidate>
      {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
      <div className="form-field">
        <label className="form-field__label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required aria-invalid={Boolean(state.error)} />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor="password">Пароль</label>
        <div className="password-field">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={Boolean(state.error)}
          />
          <button
            className="password-field__toggle"
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Сховати пароль" : "Показати пароль"}
          >
            {showPassword ? "Сховати" : "Показати"}
          </button>
        </div>
      </div>
      <Button type="submit" busy={pending}>Увійти</Button>
    </form>
  );
}
