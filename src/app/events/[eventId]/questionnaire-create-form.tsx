"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createQuestionnaireAction,
  type QuestionnaireActionState,
} from "@/app/actions/questionnaires";

const initialState: QuestionnaireActionState = {};

export function QuestionnaireCreateForm({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [audience, setAudience] = useState("guest");
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
    <form action={action} className="editor-form" noValidate>
      {state.error ? <div className="status status--error">{state.error}</div> : null}
      <div className="form-field">
        <label className="form-field__label" htmlFor="questionnaire-title">Назва</label>
        <input id="questionnaire-title" name="title" placeholder="Анкета для гостей" required />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor="questionnaire-audience">Для кого</label>
        <select id="questionnaire-audience" name="audience" value={audience} onChange={(event) => setAudience(event.currentTarget.value)}>
          <option value="customer">Замовники</option>
          <option value="guest">Гості</option>
          <option value="bride">Наречена</option>
          <option value="groom">Наречений</option>
          <option value="couple">Пара</option>
          <option value="other">Інша аудиторія</option>
        </select>
      </div>
      {audience === "guest" || audience === "other" ? <>
        <div className="form-field">
          <label className="form-field__label" htmlFor="guest-build-mode">Звідки взяти контекст</label>
          <select id="guest-build-mode" name="guestBuildMode" defaultValue="host_brief">
            <option value="host_brief">З деталей ведучого</option>
            <option value="customer_context">З відповідей замовників</option>
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="host-brief">Деталі від ведучого</label>
          <textarea className="resize-none" id="host-brief" name="hostBrief" rows={5} placeholder="Хто герої, який формат події, важливі люди, теми, історії, музика, табу та що хочемо зібрати у гостей." />
          <small>Якщо customer-відповідей ще немає, ТЯМА використає цей бриф і дані події. Усі питання можна відредагувати до публікації.</small>
        </div>
      </> : null}
      <button className="button button--brand button--solid" type="submit" disabled={pending}>
        {pending ? "Створюємо…" : "Створити анкету"}
      </button>
    </form>
  );
}
