"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { buildWelcomeQrPayload } from "@/lib/live/welcome";
import { capabilityHash, publicScreenToken } from "@/lib/questionnaires/tokens";
import { publicQuestionnaireUrl } from "@/lib/questionnaires/tokens";
import { findFamilyFeudOriginal, hideFamilyFeudGem, revealFamilyFeudGemAuthor, revealNextFamilyFeudAnswer, showFamilyFeudGem } from "@/lib/event-kit/family-feud";
import { listEventSubmissions } from "@/lib/responses/data";
import { supabaseRest } from "@/lib/supabase/rest";
import { publicSupabaseEnv } from "@/lib/env";

export type WelcomeQrSetupState = { success?: boolean; error?: string };

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

export async function configureWelcomeQrAction(eventId: string, _previousState: WelcomeQrSetupState, formData: FormData): Promise<WelcomeQrSetupState> {
  void _previousState;
  const { user, accessToken } = await hostContext(eventId);
  const file = formData.get("hero");
  if (!(file instanceof File) || !file.size || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
    return { error: "Оберіть JPG, PNG або WebP до 10 МБ." };
  }
  const headline = String(formData.get("headline") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const cta = String(formData.get("cta") ?? "").trim();
  const footer = String(formData.get("footer") ?? "").trim();
  if (!headline || !body || !cta || !footer) return { error: "Заповніть усі тексти заставки." };
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const assetId = randomUUID();
  const itemId = randomUUID();
  const storagePath = `${user.id}/${eventId}/welcome/${assetId}.${extension}`;
  const { url, publishableKey } = publicSupabaseEnv();
  const storageUrl = `${url}/storage/v1/object/event-media/${storagePath.split("/").map(encodeURIComponent).join("/")}`;
  let uploaded = false;
  let assetRecorded = false;
  try {
    const upload = await fetch(storageUrl, {
      method: "POST",
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}`, "Content-Type": file.type, "x-upsert": "false" },
      body: await file.arrayBuffer(),
    });
    if (!upload.ok) throw new Error("Storage upload failed");
    uploaded = true;
    await supabaseRest("media_assets", {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        id: assetId,
        host_id: user.id,
        event_id: eventId,
        kind: "image",
        storage_path: storagePath,
        original_filename: file.name.slice(0, 180),
        mime_type: file.type,
        size_bytes: file.size,
        status: "ready",
        privacy_status: "public_allowed",
        moderation_status: "approved",
      }),
    });
    assetRecorded = true;
    await supabaseRest("event_kit_items", {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        id: itemId,
        host_id: user.id,
        event_id: eventId,
        source_type: "manual",
        item_type: "media",
        title: headline.slice(0, 120),
        content: body.slice(0, 420),
        data: { interactive_kind: "welcome_qr", headline, body, cta, footer, asset_ids: [assetId] },
        source_refs: [{ type: "media_asset", id: assetId }],
        status: "approved",
        privacy_status: "public_allowed",
        is_useful: true,
      }),
    });
    refreshLiveRoutes(eventId);
    return { success: true };
  } catch {
    if (assetRecorded) {
      await supabaseRest(`media_assets?id=eq.${assetId}&event_id=eq.${eventId}`, { method: "DELETE", accessToken }).catch(() => undefined);
    }
    if (uploaded) {
      await fetch(storageUrl, { method: "DELETE", headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` } }).catch(() => undefined);
    }
    return { error: "Заставку не збережено. Перевірте файл і спробуйте ще раз." };
  }
}

export async function showWelcomeQrAction(eventId: string, questionnaireId: string, welcomeItemId?: string) {
  const { accessToken } = await hostContext(eventId);
  const [questionnaires, states, welcomeItems] = await Promise.all([
    supabaseRest<Array<{ id: string }>>(
      `questionnaires?select=id&id=eq.${encodeURIComponent(questionnaireId)}&event_id=eq.${encodeURIComponent(eventId)}&status=eq.published&audience=in.(guest,other)&limit=1`,
      { accessToken },
    ),
    supabaseRest<Array<{ revision: number; live_session_id: string | null; public_payload: { session_mode?: "rehearsal" | "live" } }>>(
      `live_state?select=revision,live_session_id,public_payload&event_id=eq.${encodeURIComponent(eventId)}&limit=1`,
      { accessToken },
    ),
    welcomeItemId
      ? supabaseRest<Array<{ id: string; title: string | null; content: string | null; data: Record<string, unknown> }>>(
          `event_kit_items?select=id,title,content,data&id=eq.${encodeURIComponent(welcomeItemId)}&event_id=eq.${encodeURIComponent(eventId)}&item_type=eq.media&status=in.(approved,used)&privacy_status=eq.public_allowed&do_not_use=eq.false&limit=1`,
          { accessToken },
        )
      : Promise.resolve([]),
  ]);
  const state = states[0];
  if (!questionnaires[0] || !state?.live_session_id) return;
  const welcomeItem = welcomeItems[0];
  const data = welcomeItem?.data ?? {};
  if (welcomeItem && data.interactive_kind !== "welcome_qr") return;
  const assetIds = Array.isArray(data.asset_ids) ? data.asset_ids.map(String).filter(Boolean) : [];
  const payload = buildWelcomeQrPayload({
    headline: String(data.headline ?? welcomeItem?.title ?? "ЛАСКАВО ПРОСИМО!"),
    body: String(data.body ?? welcomeItem?.content ?? "Допоможіть ведучому зібрати матеріал про цю подію."),
    cta: String(data.cta ?? "СКАНУЙ. 4 ХВИЛИНИ."),
    footer: String(data.footer ?? "Ваші відповіді вже скоро стануть частиною події."),
    questionnaireUrl: publicQuestionnaireUrl(questionnaireId),
    heroAssetId: assetIds[0],
  }, state.public_payload.session_mode ?? "rehearsal");
  await supabaseRest(`live_state?event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({
      revision: state.revision + 1,
      mode: "media",
      source_event_kit_item_id: welcomeItem?.id ?? null,
      public_payload: payload,
    }),
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
    return { ...safeData, stage: "intro", revealed: false, revealed_count: 0, gem_visible: false, gem_author_visible: false };
  });
}

export async function startInteractiveAction(eventId: string, itemId: string) {
  await updateItemData(eventId, itemId, (data, itemType) => {
    if (itemType !== "interactive" && itemType !== "media") return null;
    const { gem_author: _hiddenAuthor, selected_gem: _hiddenGem, ...safeData } = data;
    void _hiddenAuthor;
    void _hiddenGem;
    return { ...safeData, stage: "question", revealed: false, revealed_count: 0, gem_visible: false, gem_author_visible: false };
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
  if (!item || item.item_type !== "interactive" || item.data.interactive_kind !== "family_feud" || item.data.generator !== "family_feud_v3") return null;
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
