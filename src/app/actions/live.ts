"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { capabilityHash, publicScreenToken } from "@/lib/questionnaires/tokens";
import { findFamilyFeudOriginal, hideFamilyFeudGem, revealFamilyFeudAnswerAt, revealFamilyFeudGemAuthor, revealNextFamilyFeudAnswer, showFamilyFeudGem } from "@/lib/event-kit/family-feud";
import { findWhoSaidCandidate, hideWhoSaidAuthor, revealWhoSaidCandidate } from "@/lib/event-kit/who-said";
import { listEventSubmissions } from "@/lib/responses/data";
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
    const { gem_author: _hiddenAuthor, selected_gem: _hiddenGem, ...safeData } = data;
    void _hiddenAuthor;
    void _hiddenGem;
    const publicSafe = data.interactive_kind === "who_said" ? hideWhoSaidAuthor(safeData) : safeData;
    return { ...publicSafe, stage: "intro", revealed: false, revealed_count: 0, revealed_indexes: [], gem_visible: false, gem_author_visible: false };
  });
}

export async function startInteractiveAction(eventId: string, itemId: string) {
  await updateItemData(eventId, itemId, (data, itemType) => {
    if (itemType !== "interactive" && itemType !== "media") return null;
    const { gem_author: _hiddenAuthor, selected_gem: _hiddenGem, ...safeData } = data;
    void _hiddenAuthor;
    void _hiddenGem;
    const publicSafe = data.interactive_kind === "who_said" ? hideWhoSaidAuthor(safeData) : safeData;
    return { ...publicSafe, stage: "question", revealed: false, revealed_count: 0, revealed_indexes: [], gem_visible: false, gem_author_visible: false };
  });
}

async function familyFeudGemContext(eventId: string, itemId: string) {
  const { accessToken } = await hostContext(eventId);
  const [items, submissions] = await Promise.all([
    supabaseRest<Array<{ data: Record<string, unknown>; item_type: string; source_refs: Array<{ type: string; id: string }> }>>(
      `event_kit_items?select=data,item_type,source_refs&id=eq.${itemId}&event_id=eq.${eventId}&limit=1`,
      { accessToken },
    ),
    listEventSubmissions(eventId),
  ]);
  const item = items[0];
  if (!item || item.item_type !== "interactive" || item.data.interactive_kind !== "family_feud" || !["family_feud_v3", "family_feud_v4"].includes(String(item.data.generator))) return null;
  const selectedId = item.source_refs.find((ref) => ref.type === "family_feud_selected_gem")?.id;
  if (!selectedId) return null;
  const original = findFamilyFeudOriginal(submissions, selectedId);
  if (!original) return null;
  return { accessToken, item, original };
}

async function publishFamilyFeudGemState(eventId: string, itemId: string, data: Record<string, unknown>, accessToken: string) {
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

export async function showFamilyFeudGemAction(eventId: string, itemId: string) {
  const context = await familyFeudGemContext(eventId, itemId);
  if (!context) return;
  await publishFamilyFeudGemState(eventId, itemId, showFamilyFeudGem(context.item.data, context.original.value), context.accessToken);
}

export async function hideFamilyFeudGemAction(eventId: string, itemId: string) {
  const context = await familyFeudGemContext(eventId, itemId);
  if (!context) return;
  await publishFamilyFeudGemState(eventId, itemId, hideFamilyFeudGem(context.item.data), context.accessToken);
}

export async function revealFamilyFeudGemAuthorAction(eventId: string, itemId: string) {
  const context = await familyFeudGemContext(eventId, itemId);
  if (!context) return;
  await publishFamilyFeudGemState(eventId, itemId, revealFamilyFeudGemAuthor(context.item.data, context.original.value, context.original.respondent), context.accessToken);
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
    Object.assign(data, revealNextFamilyFeudAnswer(data));
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

export async function revealFamilyFeudAnswerAction(eventId: string, itemId: string, answerIndex: number) {
  await updateItemData(eventId, itemId, (data, itemType) => {
    if (itemType !== "interactive" || data.interactive_kind !== "family_feud" || data.generator !== "family_feud_v4") return null;
    return revealFamilyFeudAnswerAt(data, Number(answerIndex));
  });
}

export async function revealWhoSaidAuthorAction(eventId: string, itemId: string) {
  const { accessToken } = await hostContext(eventId);
  const [items, submissions] = await Promise.all([
    supabaseRest<Array<{ data: Record<string, unknown>; item_type: string; source_refs: Array<{ type: string; id: string }> }>>(
      `event_kit_items?select=data,item_type,source_refs&id=eq.${itemId}&event_id=eq.${eventId}&limit=1`,
      { accessToken },
    ),
    listEventSubmissions(eventId),
  ]);
  const item = items[0];
  if (!item || item.item_type !== "interactive" || item.data.generator !== "who_said_v3") return;
  const answerId = item.source_refs.find((ref) => ref.type === "answer")?.id;
  if (!answerId) return;
  const candidate = findWhoSaidCandidate(submissions, answerId);
  if (!candidate) return;
  await supabaseRest(`event_kit_items?id=eq.${itemId}&event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ data: revealWhoSaidCandidate(item.data, candidate) }),
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
