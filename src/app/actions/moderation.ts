"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { supabaseRest } from "@/lib/supabase/rest";

const PRIVACY = ["host_only", "review_required", "public_allowed"] as const;
const MODERATION = ["pending", "approved", "rejected"] as const;

export type MediaModerationState = {
  success?: boolean;
  error?: string;
};

export type AnswerModerationState = {
  success?: boolean;
  error?: string;
};

export async function updateAnswerModerationAction(
  eventId: string,
  answerId: string,
  _previousState: AnswerModerationState,
  formData: FormData,
): Promise<AnswerModerationState> {
  void _previousState;
  const user = await requireUser();
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");
  try {
    const event = await getEvent(eventId);
    if (!event || event.host_id !== user.id) return { error: "Подію не знайдено." };
    const privacyValue = String(formData.get("privacy") ?? "review_required");
    const moderationValue = String(formData.get("moderation") ?? "pending");
    const privacy = PRIVACY.includes(privacyValue as (typeof PRIVACY)[number]) ? privacyValue : "review_required";
    const moderation = MODERATION.includes(moderationValue as (typeof MODERATION)[number]) ? moderationValue : "pending";
    await supabaseRest(`answers?id=eq.${answerId}&event_id=eq.${eventId}`, {
      method: "PATCH",
      accessToken,
      body: JSON.stringify({
        privacy_status: privacy,
        moderation_status: moderation,
        is_useful: formData.get("isUseful") === "on",
        do_not_use: formData.get("doNotUse") === "on",
      }),
    });
    revalidatePath(`/events/${eventId}/responses`);
    return { success: true };
  } catch {
    return { error: "Не вдалося зберегти статус відповіді." };
  }
}

export async function updateMediaModerationAction(
  eventId: string,
  assetId: string,
  _previousState: MediaModerationState,
  formData: FormData,
): Promise<MediaModerationState> {
  const user = await requireUser();
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");
  try {
    const event = await getEvent(eventId);
    if (!event || event.host_id !== user.id) return { error: "Подію не знайдено." };
    const privacyValue = String(formData.get("privacy") ?? "review_required");
    const moderationValue = String(formData.get("moderation") ?? "pending");
    const privacy = PRIVACY.includes(privacyValue as (typeof PRIVACY)[number]) ? privacyValue : "review_required";
    const moderation = MODERATION.includes(moderationValue as (typeof MODERATION)[number]) ? moderationValue : "pending";
    await supabaseRest(`media_assets?id=eq.${assetId}&event_id=eq.${eventId}&status=eq.ready`, {
      method: "PATCH",
      accessToken,
      body: JSON.stringify({ privacy_status: privacy, moderation_status: moderation }),
    });
    revalidatePath(`/events/${eventId}/responses`);
    return { success: true };
  } catch {
    return { error: "Не вдалося зберегти модерацію медіа." };
  }
}
