"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { buildEventKitDraftsAction, type BuildEventKitState } from "@/app/actions/event-kit";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";

const initialState: BuildEventKitState = {};

export function EventKitSmartBuilder({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(buildEventKitDraftsAction.bind(null, eventId), initialState);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <form action={action} className="editor-form">
      <p>Збере окремі робочі блоки з відповідей. Нічого не публікується автоматично.</p>
      {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
      {state.success ? <StatusMessage>{state.created
        ? `Створено ${state.created} чернеток${state.skipped ? `, пропущено дублікатів: ${state.skipped}` : ""}.`
        : "Усі доступні чернетки вже зібрані — дублікатів не створено."}</StatusMessage> : null}
      <Button type="submit" busy={pending}>Зібрати робочі чернетки</Button>
    </form>
  );
}
