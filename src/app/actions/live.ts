"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import type { EventKitItem } from "@/lib/event-kit/types";
import { getActiveLiveSession, getHostLiveState } from "@/lib/live/data";
import type { LiveSession } from "@/lib/live/types";
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
  const { user, accessToken } = await hostContext(eventId);
  const existing = await getActiveLiveSession(eventId);
  if (existing) {
    await supabaseRest(`live_sessions?id=eq.${existing.id}&event_id=eq.${eventId}`, {
      method: "PATCH", accessToken, body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString() }),
    });
  }
  const sessions = await supabaseRest<LiveSession[]>("live_sessions", {
    method: "POST",
    accessToken,
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ host_id: user.id, event_id: eventId, mode, status: "active" }),
  });
  const session = sessions[0];
  if (!session) throw new Error("Session was not created");
  const current = await getHostLiveState(eventId);
  const nextState = {
    host_id: user.id,
    event_id: eventId,
    live_session_id: session.id,
    revision: (current?.revision ?? 0) + 1,
    mode: "clear",
    source_event_kit_item_id: null,
    public_payload: { kind: "clear", session_mode: mode },
  };
  if (current) {
    await supabaseRest(`live_state?event_id=eq.${eventId}`, { method: "PATCH", accessToken, body: JSON.stringify(nextState) });
  } else {
    await supabaseRest("live_state", { method: "POST", accessToken, body: JSON.stringify(nextState) });
  }
  await supabaseRest(`events?id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({
      public_screen_enabled: true,
      public_screen_token_hash: capabilityHash(publicScreenToken(eventId)),
      status: mode === "live" ? "live" : "preparing",
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
  const [session, current] = await Promise.all([getActiveLiveSession(eventId), getHostLiveState(eventId)]);
  if (!session) return;
  await supabaseRest(`live_sessions?id=eq.${session.id}&event_id=eq.${eventId}`, {
    method: "PATCH", accessToken, body: JSON.stringify({ status: "ended", ended_at: new Date().toISOString() }),
  });
  if (current) {
    await supabaseRest(`live_state?event_id=eq.${eventId}`, {
      method: "PATCH", accessToken, body: JSON.stringify({ live_session_id: null, revision: current.revision + 1, mode: "clear", source_event_kit_item_id: null, public_payload: { kind: "clear" } }),
    });
  }
  await supabaseRest(`events?id=eq.${eventId}`, { method: "PATCH", accessToken, body: JSON.stringify({ status: "ready" }) });
  refreshLiveRoutes(eventId);
}
