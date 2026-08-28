"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createEventKitItemFromAnswerAction, type AnswerEventKitState } from "@/app/actions/event-kit";
import { updateAnswerModerationAction, type AnswerModerationState } from "@/app/actions/moderation";

type AnswerReviewProps = {
  eventId: string;
  answerId: string;
  privacy: "host_only" | "review_required" | "public_allowed";
  moderation: "pending" | "approved" | "rejected";
  isUseful: boolean;
  doNotUse: boolean;
};

const moderationInitialState: AnswerModerationState = {};
const eventKitInitialState: AnswerEventKitState = {};

export function AnswerReviewActions({ eventId, answerId, privacy, moderation, isUseful, doNotUse }: AnswerReviewProps) {
  const router = useRouter();
  const [moderationState, moderationAction, moderationPending] = useActionState(
    updateAnswerModerationAction.bind(null, eventId, answerId),
    moderationInitialState,
  );
  const [eventKitState, eventKitAction, eventKitPending] = useActionState(
    createEventKitItemFromAnswerAction.bind(null, eventId, answerId),
    eventKitInitialState,
  );

  useEffect(() => {
    if (moderationState.success || eventKitState.success) router.refresh();
  }, [eventKitState.success, moderationState.success, router]);

  return (
    <>
      <div className="review-quick-actions" aria-label="Швидке рішення">
        <form action={moderationAction} noValidate><input type="hidden" name="privacy" value="host_only" /><input type="hidden" name="moderation" value="approved" /><input type="hidden" name="isUseful" value="on" /><button className="button button--neutral button--outline" type="submit" disabled={moderationPending}>Лише в роботу</button></form>
        <form action={moderationAction} noValidate><input type="hidden" name="privacy" value="public_allowed" /><input type="hidden" name="moderation" value="approved" /><input type="hidden" name="isUseful" value="on" /><button className="button button--brand button--solid" type="submit" disabled={moderationPending}>Можна на екран</button></form>
        <form action={moderationAction} noValidate><input type="hidden" name="privacy" value="host_only" /><input type="hidden" name="moderation" value="rejected" /><input type="hidden" name="doNotUse" value="on" /><button className="button button--danger button--solid" type="submit" disabled={moderationPending}>Не використовувати</button></form>
      </div>
      <details className="review-advanced">
        <summary>Точні налаштування</summary>
        <form action={moderationAction} className="moderation-form" noValidate>
          <select name="privacy" defaultValue={privacy} aria-label="Приватність"><option value="host_only">Лише ведучий</option><option value="review_required">Після перевірки</option><option value="public_allowed">Можна у public</option></select>
          <select name="moderation" defaultValue={moderation} aria-label="Модерація"><option value="pending">Очікує</option><option value="approved">Схвалено</option><option value="rejected">Відхилено</option></select>
          <label><input type="checkbox" name="isUseful" defaultChecked={isUseful} /> Корисне</label>
          <label><input type="checkbox" name="doNotUse" defaultChecked={doNotUse} /> Не використовувати</label>
          <button className="text-action" type="submit" disabled={moderationPending}>{moderationPending ? "Зберігаємо…" : "Зберегти статус →"}</button>
        </form>
      </details>
      {moderationState.error ? <p className="status status--error">{moderationState.error}</p> : null}
      {moderationState.success ? <p className="status">Статус відповіді збережено.</p> : null}
      <form action={eventKitAction} noValidate><button className="button button--neutral button--outline" type="submit" disabled={eventKitPending}>{eventKitPending ? "Додаємо…" : "Додати в Event Kit"}</button></form>
      {eventKitState.error ? <p className="status status--error">{eventKitState.error}</p> : null}
      {eventKitState.success ? <p className="status">{eventKitState.alreadyExists ? "Ця відповідь уже є в Event Kit." : "Відповідь додано в Event Kit."}</p> : null}
    </>
  );
}
