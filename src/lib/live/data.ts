import "server-only";
import { getAccessToken } from "@/lib/auth/session";
import { capabilityHash } from "@/lib/questionnaires/tokens";
import { supabaseRest } from "@/lib/supabase/rest";
import { supabaseEdge } from "@/lib/supabase/edge";
import type { LiveSession, LiveState, PublicScreenState } from "@/lib/live/types";

export async function getActiveLiveSession(eventId: string): Promise<LiveSession | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const rows = await supabaseRest<LiveSession[]>(
    `live_sessions?select=*&event_id=eq.${encodeURIComponent(eventId)}&status=eq.active&limit=1`,
    { accessToken },
  );
  return rows[0] ?? null;
}

export async function getHostLiveState(eventId: string): Promise<LiveState | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const rows = await supabaseRest<LiveState[]>(
    `live_state?select=*&event_id=eq.${encodeURIComponent(eventId)}&limit=1`,
    { accessToken },
  );
  return rows[0] ?? null;
}

export async function getPublicScreenState(rawToken: string): Promise<PublicScreenState | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(rawToken)) return null;
  return supabaseEdge<PublicScreenState | null>({ action: "get_public_screen", token_hash: capabilityHash(rawToken) });
}
