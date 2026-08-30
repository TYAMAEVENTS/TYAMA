"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { buildEventKitDraftsAction, type BuildEventKitState } from "@/app/actions/event-kit";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";
import type { EventReadiness } from "@/lib/event-kit/readiness";

const initialState: BuildEventKitState = {};

export function EventKitSmartBuilder({ eventId, readiness, primary = false }: { eventId: string; readiness?: EventReadiness; primary?: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(buildEventKitDraftsAction.bind(null, eventId), initialState);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <form action={action} className={primary ? "event-readiness" : "editor-form"} noValidate>
      {primary ? <><div className="event-readiness__summary"><strong>{readiness?.submissions ?? 0}<small>гостей</small></strong><strong>{readiness?.answers ?? 0}<small>відповідей</small></strong><strong>{readiness?.media.total ?? 0}<small>медіа</small></strong></div><div className="event-readiness__inventory"><article><span>ХТО ЦЕ СКАЗАВ</span><b>{readiness?.whoSaid.ready ?? 0} готово</b><small>{readiness?.whoSaid.needsPhoto ?? 0} потребують фото</small></article><article><span>100 ЗІ 100</span><b>{readiness?.familyFeud.readyBoards ?? 0} готові питання</b><small>{readiness?.familyFeud.lowPotential ?? 0} потребують відповідей</small></article><article><span>МЕДІА</span><b>{readiness?.media.ready ?? 0} готово</b><small>{readiness?.media.needsAttention ?? 0} потребують уваги</small></article></div></> : <p>Одним натисканням збере безпечні готові інтерактиви й оновить їх без дублікатів.</p>}
      {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
      {state.success ? <StatusMessage>Подію підготовлено: створено {state.created ?? 0}, оновлено {state.updated ?? 0}, без змін {state.unchanged ?? 0}.</StatusMessage> : null}
      {state.lowPotential ? <StatusMessage tone="error">Потребує уваги: {state.lowPotential} питань мають замало відповідей або різних груп.</StatusMessage> : null}
      <Button type="submit" busy={pending}>{primary ? "ПІДГОТУВАТИ ПОДІЮ" : "Підготувати готові матеріали"}</Button>
    </form>
  );
}
