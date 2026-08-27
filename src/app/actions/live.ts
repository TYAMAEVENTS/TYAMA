"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
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
  await supabaseRest<number>("rpc/show_event_kit_item_tx", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ p_event_id: eventId, p_item_id: itemId }),
  });
  refreshLiveRoutes(eventId);
}

export async function clearPublicScreenAction(eventId: string) {
  const { accessToken } = await hostContext(eventId);
  await supabaseRest<number>("rpc/clear_public_screen_tx", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ p_event_id: eventId }),
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
