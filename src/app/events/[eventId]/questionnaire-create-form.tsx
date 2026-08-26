"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createQuestionnaireAction,
  type QuestionnaireActionState,
} from "@/app/actions/questionnaires";

const initialState: QuestionnaireActionState = {};

export function QuestionnaireCreateForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    createQuestionnaireAction.bind(null, eventId),
    initialState,
  );

  useEffect(() => {
    if (state.questionnaireId) {
      router.replace(`/events/${eventId}/questionnaires/${state.questionnaireId}`);
    }
  }, [eventId, router, state.questionnaireId]);

  return (
    <form action={action} className="editor-form">
      {state.error ? <div className="status status--error">{state.error}</div> : null}
      <div className="form-field">
        <label className="form-field__label" htmlFor="questionnaire-title">Назва</label>
        <input id="questionnaire-title" name="title" placeholder="Анкета для гостей" required />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor="questionnaire-audience">Для кого</label>
        <select id="questionnaire-audience" name="audience" defaultValue="guest">
          <option value="customer">Замовники</option>
          <option value="guest">Гості</option>
          <option value="bride">Наречена</option>
          <option value="groom">Наречений</option>
          <option value="couple">Пара</option>
          <option value="other">Інша аудиторія</option>
        </select>
      </div>
      <button className="button button--brand button--solid" type="submit" disabled={pending}>
        {pending ? "Створюємо…" : "Створити анкету"}
      </button>
    </form>
  );
}
