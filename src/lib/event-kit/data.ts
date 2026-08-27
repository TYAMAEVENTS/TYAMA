import "server-only";
import { getAccessToken } from "@/lib/auth/session";
import { supabaseRest } from "@/lib/supabase/rest";
import type { EventKitItem } from "@/lib/event-kit/types";

export async function listEventKitItems(eventId: string): Promise<EventKitItem[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];
  return supabaseRest<EventKitItem[]>(
    `event_kit_items?select=*&event_id=eq.${encodeURIComponent(eventId)}&order=sort_order.asc,created_at.asc`,
    { accessToken },
  );
}
