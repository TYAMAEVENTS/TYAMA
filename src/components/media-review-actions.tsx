"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createEventKitItemFromMediaAction, type MediaEventKitState } from "@/app/actions/event-kit";
import type { MediaAsset } from "@/lib/media/types";

const eventKitInitialState: MediaEventKitState = {};

export function MediaReviewActions({ eventId, asset, downloadHref }: { eventId: string; asset: MediaAsset; downloadHref: string }) {
  const router = useRouter();
  const [eventKitState, eventKitAction, eventKitPending] = useActionState(
    createEventKitItemFromMediaAction.bind(null, eventId, asset.id),
    eventKitInitialState,
  );

  useEffect(() => {
    if (eventKitState.success) router.refresh();
  }, [eventKitState.success, router]);

  return (
    <>
      <p className="auto-triage"><strong>Готово для слайдшоу</strong><span>Окреме схвалення не потрібне</span></p>
      <div className="inline-actions">
        <Link className="button button--neutral button--outline" href={downloadHref}>Завантажити</Link>
        <form action={eventKitAction} noValidate><button className="button button--neutral button--outline" type="submit" disabled={eventKitPending}>{eventKitPending ? "Додаємо…" : "В Event Kit"}</button></form>
      </div>
      {eventKitState.error ? <p className="status status--error">{eventKitState.error}</p> : null}
      {eventKitState.success ? <p className="status">{eventKitState.alreadyExists ? "Медіа вже є в Event Kit." : "Медіа додано в Event Kit."}</p> : null}
    </>
  );
}
