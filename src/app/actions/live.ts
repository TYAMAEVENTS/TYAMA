"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { capabilityHash, publicScreenToken } from "@/lib/questionnaires/tokens";
import { supabaseRest } from "@/lib/supabase/rest";

const SAFE_WHEEL_FALLBACK = [
  "Сказати короткий тост із трьома словами від ведучого",
  "Показати 20 секунд переможного танцю",
  "Зробити щирий комплімент трьом гостям",
  "Показати пантомімою звичку героя події",
  "Заспівати один приспів улюбленої пісні",
  "Зробити селфі-позу разом із сусідами",
  "Дати смішний прогноз героям події на рік",
  "Тричі швидко вимовити скоромовку від ведучого",
];

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

async function updateItemData(eventId: string, itemId: string, mutate: (data: Record<string, unknown>, itemType: string) => Record<string, unknown> | null) {
  const { accessToken } = await hostContext(eventId);
  const rows = await supabaseRest<Array<{ data: Record<string, unknown>; item_type: string }>>(
    `event_kit_items?select=data,item_type&id=eq.${itemId}&event_id=eq.${eventId}&limit=1`,
    { accessToken },
  );
  const item = rows[0];
  if (!item) return;
  const data = mutate({ ...item.data }, item.item_type);
  if (!data) return;
  await supabaseRest(`event_kit_items?id=eq.${itemId}&event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ data }),
  });
  await supabaseRest<number>("rpc/show_event_kit_item_tx", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ p_event_id: eventId, p_item_id: itemId }),
  });
  refreshLiveRoutes(eventId);
}

export async function showInteractiveIntroAction(eventId: string, itemId: string) {
  await updateItemData(eventId, itemId, (data, itemType) => {
    if (itemType !== "interactive" && itemType !== "media") return null;
    return { ...data, stage: "intro", revealed: false, revealed_count: 0 };
  });
}

export async function startInteractiveAction(eventId: string, itemId: string) {
  await updateItemData(eventId, itemId, (data, itemType) => {
    if (itemType !== "interactive" && itemType !== "media") return null;
    return { ...data, stage: "question", revealed: false, revealed_count: 0 };
  });
}

export async function spinDilettantesWheelAction(eventId: string, itemId: string) {
  await updateItemData(eventId, itemId, (data, itemType) => {
    if (itemType !== "interactive" || data.interactive_kind !== "dilettantes") return null;
    const configured = Array.isArray(data.wheel_options) ? data.wheel_options.map(String).filter(Boolean) : [];
    const options = configured.length ? configured : SAFE_WHEEL_FALLBACK;
    const selectedIndex = Math.floor(Math.random() * options.length);
    return { ...data, stage: "wheel", wheel_options: options, wheel_selected: options[selectedIndex], wheel_selected_index: selectedIndex, wheel_rotation: 1080 + selectedIndex * (360 / options.length) };
  });
}

export async function revealInteractiveAction(eventId: string, itemId: string) {
  const { accessToken } = await hostContext(eventId);
  const rows = await supabaseRest<Array<{ data: Record<string, unknown>; item_type: string }>>(
    `event_kit_items?select=data,item_type&id=eq.${itemId}&event_id=eq.${eventId}&limit=1`,
    { accessToken },
  );
  const item = rows[0];
  if (!item || item.item_type !== "interactive") return;
  const data = { ...item.data };
  if (data.interactive_kind === "family_feud") {
    const answers = Array.isArray(data.answers) ? data.answers : [];
    data.revealed_count = Math.min(Number(data.revealed_count ?? 0) + 1, answers.length);
    data.stage = "reveal";
  } else {
    data.revealed = true;
    data.stage = "reveal";
  }
  await supabaseRest(`event_kit_items?id=eq.${itemId}&event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ data }),
  });
  await supabaseRest<number>("rpc/show_event_kit_item_tx", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ p_event_id: eventId, p_item_id: itemId }),
  });
  refreshLiveRoutes(eventId);
}

export async function resetInteractiveAction(eventId: string, itemId: string) {
  await startInteractiveAction(eventId, itemId);
}

export async function advanceSlideshowAction(eventId: string, itemId: string) {
  const { accessToken } = await hostContext(eventId);
  const rows = await supabaseRest<Array<{ data: Record<string, unknown>; item_type: string }>>(
    `event_kit_items?select=data,item_type&id=eq.${itemId}&event_id=eq.${eventId}&limit=1`,
    { accessToken },
  );
  const item = rows[0];
  if (!item || item.item_type !== "media") return;
  const assetIds = Array.isArray(item.data.asset_ids) ? item.data.asset_ids : [];
  const nextIndex = assetIds.length ? (Number(item.data.current_index ?? 0) + 1) % assetIds.length : 0;
  const data = { ...item.data, current_index: nextIndex };
  await supabaseRest(`event_kit_items?id=eq.${itemId}&event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ data }),
  });
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
