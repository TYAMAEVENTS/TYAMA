import { getAccessToken } from "@/lib/auth/session";
import { supabaseRest } from "@/lib/supabase/rest";
import type { TyamaEvent } from "@/lib/events/types";

export async function listEvents(): Promise<TyamaEvent[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];
  return supabaseRest<TyamaEvent[]>(
    "events?select=*&status=neq.archived&order=event_date.asc.nullslast,created_at.desc",
    { accessToken },
  );
}

export async function getEvent(eventId: string): Promise<TyamaEvent | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const rows = await supabaseRest<TyamaEvent[]>(
    `events?select=*&id=eq.${encodeURIComponent(eventId)}&limit=1`,
    { accessToken },
  );
  return rows[0] ?? null;
}
