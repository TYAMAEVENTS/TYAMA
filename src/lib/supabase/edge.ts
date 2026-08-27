import "server-only";
import { publicSupabaseEnv } from "@/lib/env";

export async function supabaseEdge<T>(payload: Record<string, unknown>): Promise<T> {
  const { url, publishableKey } = publicSupabaseEnv();
  const response = await fetch(`${url}/functions/v1/public-api`, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Public API request failed");
  return (await response.json()) as T;
}
