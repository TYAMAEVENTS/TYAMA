"use client";

import { useActionState } from "react";
import { submitPublicQuestionnaireAction, type PublicSubmissionState } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";
import type { PublicQuestionnaire } from "@/lib/questionnaires/data";

const initialState: PublicSubmissionState = {};

export function PublicQuestionnaireForm({ questionnaire, token, idempotencyKey }: { questionnaire: PublicQuestionnaire; token: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(submitPublicQuestionnaireAction.bind(null, token), initialState);
  if (state.success) {
    return <section className="public-success"><span className="public-success__mark">✓</span><h2>Збіглося.</h2><p>Відповіді вже у Свята. Їх ніхто не побачить публічно без його перевірки.</p></section>;
  }
  return (
    <form action={action} className="public-form">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
      <div className="public-question public-question--identity">
        <label htmlFor="displayName"><span className="public-question__index">00</span><strong>Як до вас звертатися?</strong></label>
        <input id="displayName" name="displayName" required autoComplete="name" />
      </div>
      {questionnaire.questions.map((question, index) => (
        <div className="public-question" key={question.id}>
          <label htmlFor={`answer-${question.id}`}><span className="public-question__index">{String(index + 1).padStart(2, "0")}</span><strong>{question.prompt}</strong>{question.is_required ? <em>Обов’язково</em> : null}</label>
          {question.help_text ? <p>{question.help_text}</p> : null}
          {question.type === "long_text" ? <textarea id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required} /> : null}
          {question.type === "short_text" ? <input id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required} /> : null}
          {question.type === "boolean" ? <select id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required}><option value="">Оберіть</option><option value="yes">Так</option><option value="no">Ні</option></select> : null}
          {(question.type === "single_select" || question.type === "multi_select") ? <select id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required} multiple={question.type === "multi_select"}>{question.type === "single_select" ? <option value="">Оберіть</option> : null}{(question.settings.options ?? []).map((option) => <option value={option} key={option}>{option}</option>)}</select> : null}
          {question.type === "media" ? <div className="status">Завантаження файлів буде ввімкнено лише після окремого media QA.</div> : null}
        </div>
      ))}
      <div className="public-submit"><p>Натискаючи «Надіслати», ви передаєте відповіді ведучому цієї події. Публікація можлива лише після ручної модерації.</p><Button type="submit" busy={pending}>Надіслати Святу →</Button></div>
    </form>
  );
}
