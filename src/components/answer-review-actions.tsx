"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

export function AnswerReviewActions({ eventId, answerId, privacy, moderation, isUseful, doNotUse }: AnswerReviewProps) {
  const router = useRouter();
  const [moderationState, moderationAction, moderationPending] = useActionState(
    updateAnswerModerationAction.bind(null, eventId, answerId),
    moderationInitialState,
  );

  useEffect(() => {
    if (moderationState.success) router.refresh();
  }, [moderationState.success, router]);

  const automaticallySelected = privacy === "public_allowed" && moderation === "approved" && isUseful && !doNotUse;

  return (
    <>
      {automaticallySelected ? <div className="auto-triage"><strong>Автоматично відібрано</strong><form action={moderationAction} noValidate><input type="hidden" name="privacy" value="host_only" /><input type="hidden" name="moderation" value="rejected" /><input type="hidden" name="doNotUse" value="on" /><button className="text-action" type="submit" disabled={moderationPending}>Прибрати з добірки</button></form></div> : <div className="review-quick-actions" aria-label="Потрібне рішення ведучого">
        <form action={moderationAction} noValidate><input type="hidden" name="privacy" value="public_allowed" /><input type="hidden" name="moderation" value="approved" /><input type="hidden" name="isUseful" value="on" /><button className="button button--brand button--solid" type="submit" disabled={moderationPending}>Дозволити для інтерактивів</button></form>
        <form action={moderationAction} noValidate><input type="hidden" name="privacy" value="host_only" /><input type="hidden" name="moderation" value="rejected" /><input type="hidden" name="doNotUse" value="on" /><button className="button button--danger button--solid" type="submit" disabled={moderationPending}>Не використовувати</button></form>
      </div>}
      {moderationState.error ? <p className="status status--error">{moderationState.error}</p> : null}
      {moderationState.success ? <p className="status">Статус відповіді збережено.</p> : null}
    </>
  );
}
