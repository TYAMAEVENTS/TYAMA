import { publicSupabaseEnv } from "@/lib/env";
import type { AuthTokenResponse, AuthUser } from "@/lib/auth/types";

type AuthErrorPayload = { error_description?: string; msg?: string; message?: string };

export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function authFetch<T>(path: string, init: RequestInit): Promise<T> {
  const { url, publishableKey } = publicSupabaseEnv();
  const response = await fetch(`${url}/auth/v1${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    let payload: AuthErrorPayload = {};
    try {
      payload = (await response.json()) as AuthErrorPayload;
    } catch {
      // Keep the user-facing error generic if Auth returned a non-JSON response.
    }
    throw new AuthApiError(
      payload.error_description ?? payload.msg ?? payload.message ?? "Auth request failed",
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function signInWithPassword(email: string, password: string) {
  return authFetch<AuthTokenResponse>("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function refreshAccessToken(refreshToken: string) {
  return authFetch<AuthTokenResponse>("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function fetchAuthUser(accessToken: string) {
  return authFetch<AuthUser>("/user", {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function updateAuthUserPassword(accessToken: string, password: string) {
  return authFetch<{ user: AuthUser }>("/user", {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
}

export async function revokeSession(accessToken: string) {
  const { url, publishableKey } = publicSupabaseEnv();
  await fetch(`${url}/auth/v1/logout?scope=local`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
