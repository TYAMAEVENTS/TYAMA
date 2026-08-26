"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signInWithPassword, revokeSession } from "@/lib/auth/api";
import { AUTH_COOKIES, AUTH_COOKIE_OPTIONS } from "@/lib/auth/constants";

export type LoginState = { error?: string };

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Вкажіть email і пароль." };
  }

  try {
    const auth = await signInWithPassword(email, password);
    const cookieStore = await cookies();
    const expiresAt = auth.expires_at ?? Math.floor(Date.now() / 1000) + auth.expires_in;
    cookieStore.set(AUTH_COOKIES.access, auth.access_token, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: auth.expires_in,
    });
    cookieStore.set(AUTH_COOKIES.refresh, auth.refresh_token, {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30,
    });
    cookieStore.set(AUTH_COOKIES.expiresAt, String(expiresAt), {
      ...AUTH_COOKIE_OPTIONS,
      maxAge: auth.expires_in,
    });
  } catch {
    return { error: "Email або пароль не підійшли. Перевірте дані й спробуйте ще раз." };
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_COOKIES.access)?.value;
  if (accessToken) await revokeSession(accessToken).catch(() => undefined);
  cookieStore.delete(AUTH_COOKIES.access);
  cookieStore.delete(AUTH_COOKIES.refresh);
  cookieStore.delete(AUTH_COOKIES.expiresAt);
  redirect("/login");
}
