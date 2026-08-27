"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { addQuestionAction, type AddQuestionState } from "@/app/actions/questionnaires";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";

const initialState: AddQuestionState = {};

export function QuestionAddForm({ eventId, questionnaireId }: { eventId: string; questionnaireId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(addQuestionAction.bind(null, eventId, questionnaireId), initialState);

  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    router.refresh();
  }, [router, state]);

  return (
    <form action={action} className="editor-form" ref={formRef}>
      {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
      <div className="form-field"><label className="form-field__label" htmlFor="new-prompt">Текст питання</label><textarea id="new-prompt" name="prompt" required /></div>
      <div className="form-grid"><div className="form-field"><label className="form-field__label" htmlFor="new-type">Тип</label><select id="new-type" name="type"><option value="short_text">Коротка відповідь</option><option value="long_text">Розгорнута відповідь</option><option value="boolean">Так / ні</option><option value="single_select">Один варіант</option><option value="multi_select">Кілька варіантів</option><option value="media">Фото / відео / аудіо</option></select></div><label className="checkbox-field"><input type="checkbox" name="isRequired" /> Обов’язкове</label></div>
      <Button type="submit" busy={pending}>Додати питання</Button>
    </form>
  );
}
