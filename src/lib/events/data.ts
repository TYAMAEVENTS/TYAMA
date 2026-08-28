import { getAccessToken } from "@/lib/auth/session";
import { supabaseRest } from "@/lib/supabase/rest";
import type { TyamaEvent } from "@/lib/events/types";

export async function listEvents(includeArchived = false): Promise<TyamaEvent[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];
  return supabaseRest<TyamaEvent[]>(
    `events?select=*${includeArchived ? "" : "&status=neq.archived"}&order=event_date.asc.nullslast,created_at.desc`,
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

export async function getEventSubmissionCounts(): Promise<Map<string, number>> {
  const accessToken = await getAccessToken();
  if (!accessToken) return new Map();
  const rows = await supabaseRest<Array<{ event_id: string }>>(
    "submissions?select=event_id&status=neq.draft",
    { accessToken },
  );
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
  return counts;
}
