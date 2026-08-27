"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createEventKitItemFromMediaAction, type MediaEventKitState } from "@/app/actions/event-kit";
import { updateMediaModerationAction, type MediaModerationState } from "@/app/actions/moderation";
import type { MediaAsset } from "@/lib/media/types";

const moderationInitialState: MediaModerationState = {};
const eventKitInitialState: MediaEventKitState = {};

export function MediaReviewActions({ eventId, asset, downloadHref }: { eventId: string; asset: MediaAsset; downloadHref: string }) {
  const router = useRouter();
  const [moderationState, moderationAction, moderationPending] = useActionState(
    updateMediaModerationAction.bind(null, eventId, asset.id),
    moderationInitialState,
  );
  const [eventKitState, eventKitAction, eventKitPending] = useActionState(
    createEventKitItemFromMediaAction.bind(null, eventId, asset.id),
    eventKitInitialState,
  );

  useEffect(() => {
    if (moderationState.success || eventKitState.success) router.refresh();
  }, [eventKitState.success, moderationState.success, router]);

  return (
    <>
      <form action={moderationAction} className="moderation-form">
        <select name="privacy" defaultValue={asset.privacy_status} aria-label="Приватність медіа"><option value="host_only">Лише ведучий</option><option value="review_required">Після перевірки</option><option value="public_allowed">Можна у public</option></select>
        <select name="moderation" defaultValue={asset.moderation_status} aria-label="Модерація медіа"><option value="pending">Очікує</option><option value="approved">Схвалено</option><option value="rejected">Відхилено</option></select>
        <button className="text-action" type="submit" disabled={moderationPending}>{moderationPending ? "Зберігаємо…" : "Зберегти медіа →"}</button>
      </form>
      {moderationState.error ? <p className="status status--error">{moderationState.error}</p> : null}
      {moderationState.success ? <p className="status">Модерацію збережено.</p> : null}
      <div className="inline-actions">
        <Link className="button button--neutral button--outline" href={downloadHref}>Завантажити</Link>
        <form action={eventKitAction}><button className="button button--neutral button--outline" type="submit" disabled={eventKitPending}>{eventKitPending ? "Додаємо…" : "В Event Kit"}</button></form>
      </div>
      {eventKitState.error ? <p className="status status--error">{eventKitState.error}</p> : null}
      {eventKitState.success ? <p className="status">{eventKitState.alreadyExists ? "Медіа вже є в Event Kit." : "Медіа додано в Event Kit."}</p> : null}
    </>
  );
}
