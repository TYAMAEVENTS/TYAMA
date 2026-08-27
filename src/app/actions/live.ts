"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import type { EventKitItem } from "@/lib/event-kit/types";
import { getActiveLiveSession, getHostLiveState } from "@/lib/live/data";
import { capabilityHash, publicScreenToken } from "@/lib/questionnaires/tokens";
import { supabaseRest } from "@/lib/supabase/rest";

async function hostContext(eventId: string) {
  const user = await requireUser();
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");
  const event = await getEvent(eventId);
  if (!event || event.host_id !== user.id) throw new Error("Event not found");
  return { user, accessToken };
}

function refreshLiveRoutes(eventId: string) {
  revalidatePath(`/events/${eventId}/rehearsal`);
  revalidatePath(`/events/${eventId}/live`);
}

export async function startLiveSessionAction(eventId: string, mode: "rehearsal" | "live") {
  const { accessToken } = await hostContext(eventId);
  await supabaseRest<string>("rpc/start_live_session_tx", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      p_event_id: eventId,
      p_mode: mode,
      p_public_screen_token_hash: capabilityHash(publicScreenToken(eventId)),
    }),
  });
  refreshLiveRoutes(eventId);
}

export async function showEventKitItemAction(eventId: string, itemId: string) {
  const { accessToken } = await hostContext(eventId);
  const session = await getActiveLiveSession(eventId);
  if (!session) return;
  const items = await supabaseRest<EventKitItem[]>(
    `event_kit_items?select=*&id=eq.${itemId}&event_id=eq.${eventId}&status=in.(approved,used)&privacy_status=eq.public_allowed&do_not_use=eq.false&limit=1`,
    { accessToken },
  );
  const item = items[0];
  if (!item) return;
  const current = await getHostLiveState(eventId);
  const mode = item.item_type === "question" ? "question" : item.item_type === "media" ? "media" : "message";
  await supabaseRest(`live_state?event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({
      live_session_id: session.id,
      revision: (current?.revision ?? 0) + 1,
      mode,
      source_event_kit_item_id: item.id,
      public_payload: { kind: mode, item_type: item.item_type, title: item.title, content: item.content, session_mode: session.mode },
    }),
  });
  refreshLiveRoutes(eventId);
}

export async function clearPublicScreenAction(eventId: string) {
  const { accessToken } = await hostContext(eventId);
  const [session, current] = await Promise.all([getActiveLiveSession(eventId), getHostLiveState(eventId)]);
  if (!session || !current) return;
  await supabaseRest(`live_state?event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({
      revision: current.revision + 1,
      mode: "clear",
      source_event_kit_item_id: null,
      public_payload: { kind: "clear", session_mode: session.mode },
    }),
  });
  refreshLiveRoutes(eventId);
}

export async function endLiveSessionAction(eventId: string) {
  const { accessToken } = await hostContext(eventId);
  await supabaseRest<boolean>("rpc/end_live_session_tx", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ p_event_id: eventId }),
  });
  refreshLiveRoutes(eventId);
}
