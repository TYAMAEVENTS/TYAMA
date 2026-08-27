import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  moveQuestionAction,
  setQuestionnaireStatusAction,
  updateQuestionAction,
  updateQuestionnaireAction,
} from "@/app/actions/questionnaires";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { getQuestionnaire, listQuestions } from "@/lib/questionnaires/data";
import { publicQuestionnaireUrl } from "@/lib/questionnaires/tokens";
import { AUDIENCE_LABELS, QUESTION_TYPE_LABELS } from "@/lib/questionnaires/types";
import { QuestionAddForm } from "./question-add-form";

export const metadata: Metadata = { title: "Редактор анкети" };

const ERRORS: Record<string, string> = {
  title: "Додайте назву анкети.",
  "no-active-questions": "Для публікації потрібне хоча б одне активне питання.",
  "question-prompt": "Текст питання не може бути порожнім.",
};

export default async function QuestionnaireEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string; questionnaireId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireUser();
  const { eventId, questionnaireId } = await params;
  const [{ error }, event, questionnaire, questions] = await Promise.all([
    searchParams,
    getEvent(eventId),
    getQuestionnaire(questionnaireId, eventId),
    listQuestions(questionnaireId, eventId),
  ]);
  if (!event || !questionnaire) notFound();
  const publicUrl = publicQuestionnaireUrl(questionnaire.id);

  return (
    <AppShell>
      <nav aria-label="Навігаційний шлях" className="breadcrumbs">
        <Link href="/dashboard">Події</Link><span aria-hidden="true">/</span>
        <Link href={`/events/${event.id}`}>{event.title}</Link><span aria-hidden="true">/</span>
        <Link href={`/events/${event.id}/questionnaires`}>Анкети</Link><span aria-hidden="true">/</span>
        <span aria-current="page">{questionnaire.title}</span>
      </nav>

      <header className="page-heading page-heading--editor">
        <div><span className="eyebrow">{AUDIENCE_LABELS[questionnaire.audience]} / {questionnaire.status}</span><h1>{questionnaire.title}</h1><p>Зміни зберігаються в цій події й не впливають на інші анкети.</p></div>
        <Link href={`/q/${publicUrl.split("/").pop()}`} target="_blank" className="button button--neutral button--outline">Переглянути як гість ↗</Link>
      </header>

      {error && ERRORS[error] ? <div className="status status--error">{ERRORS[error]}</div> : null}

      <section className="questionnaire-settings">
        <form action={updateQuestionnaireAction.bind(null, eventId, questionnaireId)} className="editor-form">
          <div className="form-field"><label className="form-field__label" htmlFor="questionnaire-title">Назва</label><input id="questionnaire-title" name="title" defaultValue={questionnaire.title} required /></div>
          <div className="form-field"><label className="form-field__label" htmlFor="questionnaire-description">Вступний текст</label><textarea id="questionnaire-description" name="description" defaultValue={questionnaire.description ?? ""} /></div>
          <fieldset className="media-permissions"><legend>Що можна завантажувати</legend><label><input type="checkbox" name="allowImages" defaultChecked={questionnaire.allow_images} /> Фото до 10 МБ</label><label><input type="checkbox" name="allowVideo" defaultChecked={questionnaire.allow_video} /> Відео до 100 МБ</label><label><input type="checkbox" name="allowAudio" defaultChecked={questionnaire.allow_audio} /> Аудіо до 25 МБ</label></fieldset>
          <button className="button button--neutral button--outline" type="submit">Зберегти налаштування</button>
        </form>

        <div className="publish-panel">
          <span className={`state-chip state-chip--${questionnaire.status}`}>{questionnaire.status}</span>
          <p>{questionnaire.status === "published" ? "Посилання активне. Нові відповіді приймаються." : questionnaire.status === "closed" ? "Анкета закрита. Наявні відповіді збережено." : "Анкету бачить лише ведучий."}</p>
          {questionnaire.status === "published" ? <div className="share-link"><code>{publicUrl}</code></div> : null}
          <div className="inline-actions">
            {questionnaire.status !== "published" ? <form action={setQuestionnaireStatusAction.bind(null, eventId, questionnaireId, "published")}><button className="button button--brand button--solid" type="submit">Опублікувати</button></form> : null}
            {questionnaire.status === "published" ? <form action={setQuestionnaireStatusAction.bind(null, eventId, questionnaireId, "closed")}><button className="button button--neutral button--outline" type="submit">Закрити прийом</button></form> : null}
            {questionnaire.status === "closed" ? <form action={setQuestionnaireStatusAction.bind(null, eventId, questionnaireId, "draft")}><button className="button button--neutral button--outline" type="submit">Повернути в чернетку</button></form> : null}
          </div>
        </div>
      </section>

      <section className="section-heading"><div><span className="eyebrow">ПИТАННЯ / {String(questions.length).padStart(2, "0")}</span><h2>Контекст, який збираємо</h2></div></section>
      <div className="question-list">
        {questions.map((question, index) => (
          <article className={`question-card ${question.is_active ? "" : "question-card--inactive"}`} key={question.id}>
            <div className="question-card__index">{String(index + 1).padStart(2, "0")}</div>
            <form action={updateQuestionAction.bind(null, eventId, questionnaireId, question.id)} className="question-card__form">
              <input type="hidden" name="type" value={question.type} />
              <div className="question-card__meta"><span>{QUESTION_TYPE_LABELS[question.type]}</span><span>{question.default_privacy}</span></div>
              <div className="form-field"><label className="form-field__label" htmlFor={`prompt-${question.id}`}>Питання</label><textarea id={`prompt-${question.id}`} name="prompt" defaultValue={question.prompt} required /></div>
              <div className="form-field"><label className="form-field__label" htmlFor={`help-${question.id}`}>Підказка</label><input id={`help-${question.id}`} name="helpText" defaultValue={question.help_text ?? ""} /></div>
              <div className="question-options">
                <label><input type="checkbox" name="isRequired" defaultChecked={question.is_required} /> Обов’язкове</label>
                <label><input type="checkbox" name="isActive" defaultChecked={question.is_active} /> Активне</label>
                <label><span>Приватність</span><select name="privacy" defaultValue={question.default_privacy}><option value="host_only">Лише ведучий</option><option value="review_required">Після перевірки</option><option value="public_allowed">Можна у public</option></select></label>
              </div>
              <button className="text-action" type="submit">Зберегти питання →</button>
            </form>
            <div className="question-card__order" aria-label="Змінити порядок">
              <form action={moveQuestionAction.bind(null, eventId, questionnaireId, question.id, "up")}><button type="submit" disabled={index === 0} aria-label="Перемістити вище">↑</button></form>
              <form action={moveQuestionAction.bind(null, eventId, questionnaireId, question.id, "down")}><button type="submit" disabled={index === questions.length - 1} aria-label="Перемістити нижче">↓</button></form>
            </div>
          </article>
        ))}
      </div>

      <section className="add-question-panel">
        <span className="eyebrow">ДОДАТИ ПИТАННЯ</span>
        <QuestionAddForm eventId={eventId} questionnaireId={questionnaireId} />
      </section>
    </AppShell>
  );
}
