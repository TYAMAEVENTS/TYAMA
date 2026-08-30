import "server-only";
import { getAccessToken } from "@/lib/auth/session";
import { supabaseRest } from "@/lib/supabase/rest";
import type { RehearsalState, ShowSession, ShowSet } from "./types";

export async function getShowSet(eventId: string): Promise<ShowSet | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const rows = await supabaseRest<ShowSet[]>(
    `show_sets?select=id,event_id,row_version,current_revision_id,prepared_at,show_set_items(id,source_event_kit_item_id,host_order,included,readiness,public_eligible,attention_state,blocker_reason,event_kit_items(item_type,title,content,data)),show_set_revisions(id,revision_number,snapshot_hash,created_at)&event_id=eq.${encodeURIComponent(eventId)}&show_set_items.order=host_order.asc&show_set_revisions.order=revision_number.desc`,
    { accessToken },
  );
  return rows[0] ?? null;
}

export async function getShowSession(eventId: string): Promise<ShowSession | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const rows = await supabaseRest<ShowSession[]>(`live_sessions?select=id,mode,status,show_set_id,show_set_revision_id,snapshot_hash,current_position,current_stage,runtime_version&event_id=eq.${encodeURIComponent(eventId)}&status=eq.active&limit=1`, { accessToken });
  return rows[0] ?? null;
}

export async function getRehearsalState(sessionId: string): Promise<RehearsalState | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const rows = await supabaseRest<RehearsalState[]>(`rehearsal_state?select=revision,current_position,stage,private_payload&session_id=eq.${encodeURIComponent(sessionId)}&limit=1`, { accessToken });
  return rows[0] ?? null;
}

