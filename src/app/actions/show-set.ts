"use server";

import { randomUUID } from "node:crypto";
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
  return accessToken;
}

function refresh(eventId: string) {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/show-builder`);
  revalidatePath(`/events/${eventId}/rehearsal`);
  revalidatePath(`/events/${eventId}/live`);
}

export async function prepareShowSetAction(eventId: string, expectedVersion: number) {
  const accessToken = await hostContext(eventId);
  await supabaseRest("rpc/prepare_show_set_tx", { method: "POST", accessToken, body: JSON.stringify({ p_event_id: eventId, p_expected_version: expectedVersion, p_idempotency_key: randomUUID() }) });
  refresh(eventId);
}

export async function mutateShowSetItemAction(eventId: string, itemId: string, action: "exclude" | "include" | "restore" | "up" | "down", expectedVersion: number) {
  const accessToken = await hostContext(eventId);
  await supabaseRest("rpc/mutate_show_set_item_tx", { method: "POST", accessToken, body: JSON.stringify({ p_event_id: eventId, p_show_set_item_id: itemId, p_action: action, p_expected_version: expectedVersion, p_idempotency_key: randomUUID() }) });
  refresh(eventId);
}

export async function startShowSessionAction(eventId: string, mode: "rehearsal" | "live", revisionId: string) {
  const accessToken = await hostContext(eventId);
  await supabaseRest("rpc/start_show_session_tx", { method: "POST", accessToken, body: JSON.stringify({ p_event_id: eventId, p_mode: mode, p_revision_id: revisionId, p_public_screen_token_hash: capabilityHash(publicScreenToken(eventId)), p_idempotency_key: randomUUID() }) });
  refresh(eventId);
}

export async function showRuntimeAction(eventId: string, sessionId: string, action: string, expectedVersion: number, undoToken?: string | FormData) {
  const accessToken = await hostContext(eventId);
  await supabaseRest("rpc/show_runtime_action_tx", { method: "POST", accessToken, body: JSON.stringify({ p_event_id: eventId, p_session_id: sessionId, p_action: action, p_expected_version: expectedVersion, p_idempotency_key: randomUUID(), p_undo_token: typeof undoToken === "string" ? undoToken : null }) });
  refresh(eventId);
}
