"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildEventKitDraftsAction, type BuildEventKitState } from "@/app/actions/event-kit";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";

type AnswerGroup = { prompt: string; answerIds: string[] };
const initialState: BuildEventKitState = {};

export function BulkResponseBuilder({ eventId, groups, reviewCount }: { eventId: string; groups: AnswerGroup[]; reviewCount: number }) {
  const router = useRouter();
  const allIds = useMemo(() => groups.flatMap((group) => group.answerIds), [groups]);
  const [selected, setSelected] = useState(() => new Set(allIds));
  const [state, action, pending] = useActionState(buildEventKitDraftsAction.bind(null, eventId), initialState);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  function toggleGroup(ids: string[]) {
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  return (
    <section className="bulk-builder" aria-labelledby="bulk-builder-title">
      <header><div><span className="eyebrow">5 ХВИЛИН / ОДНА ДІЯ</span><h2 id="bulk-builder-title">Зібрати інтерактиви</h2><p>ТЯМА вже прибрала з добірки приватні та підозрілі відповіді. Позначте потрібні питання — усі чисті відповіді всередині вже вибрані.</p></div><div className="bulk-builder__count"><strong>{selected.size}</strong><span>відповідей вибрано</span></div></header>
      {reviewCount ? <StatusMessage tone="error">На швидку перевірку відкладено: {reviewCount}. Вони не потраплять в інтерактив автоматично.</StatusMessage> : null}
      <div className="inline-actions">
        <button className="button button--neutral button--outline" type="button" onClick={() => setSelected(new Set(allIds))}>Вибрати все</button>
        <button className="button button--neutral button--outline" type="button" onClick={() => setSelected(new Set())}>Зняти все</button>
      </div>
      <form action={action} noValidate>
        {[...selected].map((id) => <input key={id} type="hidden" name="answerId" value={id} />)}
        <div className="bulk-question-groups">
          {groups.map((group) => {
            const checked = group.answerIds.every((id) => selected.has(id));
            return <button className={`bulk-question ${checked ? "bulk-question--selected" : ""}`} type="button" onClick={() => toggleGroup(group.answerIds)} aria-pressed={checked} key={group.prompt}><span>{checked ? "Вибрано" : "Пропущено"}</span><strong>{group.prompt}</strong><small>{group.answerIds.length} відповідей</small></button>;
          })}
        </div>
        {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
        {state.success ? <StatusMessage>{state.created ? `Готово: створено ${state.created} інтерактивів.` : "Ці інтерактиви вже є в Event Kit."}</StatusMessage> : null}
        <Button type="submit" busy={pending} disabled={!selected.size}>Зібрати все в Event Kit →</Button>
      </form>
    </section>
  );
}
