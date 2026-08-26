import { publicSupabaseEnv, serverSupabaseEnv } from "@/lib/env";

export class DataApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

type RestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  accessToken?: string;
  trustedServer?: boolean;
};

export async function supabaseRest<T>(
  path: string,
  options: RestOptions = {},
): Promise<T> {
  const publicEnv = publicSupabaseEnv();
  const serverEnv = options.trustedServer ? serverSupabaseEnv() : null;
  const url = serverEnv?.url ?? publicEnv.url;
  const apiKey = serverEnv?.secretKey ?? publicEnv.publishableKey;
  const authorization = options.accessToken ?? apiKey;

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    cache: options.cache ?? "no-store",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${authorization}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let payload: { message?: string; code?: string } = {};
    try {
      payload = (await response.json()) as { message?: string; code?: string };
    } catch {
      // Keep a safe generic message below.
    }
    throw new DataApiError(
      payload.message ?? "Database request failed",
      response.status,
      payload.code,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
