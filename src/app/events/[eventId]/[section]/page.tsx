import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createEventKitItemAction, createEventKitItemFromAnswerAction, updateEventKitItemAction } from "@/app/actions/event-kit";
import { updateAnswerModerationAction } from "@/app/actions/moderation";
import { clearPublicScreenAction, endLiveSessionAction, showEventKitItemAction, startLiveSessionAction } from "@/app/actions/live";
import { AppShell } from "@/components/app-shell";
import { MediaReviewCard } from "@/components/media-review-card";
import { requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { listEventKitItems } from "@/lib/event-kit/data";
import { EVENT_KIT_TYPE_LABELS } from "@/lib/event-kit/types";
import { getActiveLiveSession, getHostLiveState } from "@/lib/live/data";
import { publicScreenUrl } from "@/lib/questionnaires/tokens";
import { listQuestionnaires } from "@/lib/questionnaires/data";
import { AUDIENCE_LABELS } from "@/lib/questionnaires/types";
import { listEventSubmissions } from "@/lib/responses/data";
import { QuestionnaireCreateForm } from "../questionnaire-create-form";

const SECTION_COPY: Record<string, { title: string; description: string }> = {
  questionnaires: { title: "Анкети", description: "Customer і guest questionnaires для цієї події." },
  responses: { title: "Відповіді", description: "Сирі відповіді залишаються доступними незалежно від ШІ." },
  "event-kit": { title: "Event Kit", description: "Структурований матеріал Свята, не AI-чат." },
  rehearsal: { title: "Репетиція", description: "Безпечна перевірка майбутнього Live без старту події." },
  live: { title: "Live Mode", description: "Поточний блок, приватна підказка і точний public state." },
  backup: { title: "Backup", description: "Battle-ready копія матеріалів перед реальною подією." },
};

export const metadata: Metadata = { title: "Розділ події" };

export default async function EventSectionPage({ params, searchParams }: { params: Promise<{ eventId: string; section: string }>; searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { eventId, section } = await params;
  const config = SECTION_COPY[section];
  if (!config) notFound();
  const event = await getEvent(eventId);
  if (!event) notFound();
  if (section === "questionnaires") {
    const [questionnaires, query] = await Promise.all([listQuestionnaires(eventId), searchParams]);
    return (
      <AppShell>
        <nav aria-label="Навігаційний шлях" className="breadcrumbs"><Link href="/dashboard">Події</Link><span aria-hidden="true">/</span><Link href={`/events/${event.id}`}>{event.title}</Link><span aria-hidden="true">/</span><span aria-current="page">Анкети</span></nav>
        <div className="page-heading"><div><span className="eyebrow">QUESTIONNAIRES / {String(questionnaires.length).padStart(2, "0")}</span><h1>Анкети</h1><p>Окремі customer і guest потоки. Публічно доступна лише опублікована анкета за приватним посиланням.</p></div></div>
        {query.error ? <div className="status status--error">{query.error === "title" ? "Додайте назву анкети." : "Анкету не створено. Спробуйте ще раз."}</div> : null}
        <section className="questionnaire-layout">
          <div className="questionnaire-list">
            {questionnaires.length ? questionnaires.map((questionnaire, index) => (
              <Link href={`/events/${eventId}/questionnaires/${questionnaire.id}`} className="questionnaire-row" key={questionnaire.id}>
                <span className="questionnaire-row__index">{String(index + 1).padStart(2, "0")}</span>
                <div><span className="eyebrow">{AUDIENCE_LABELS[questionnaire.audience]}</span><h2>{questionnaire.title}</h2><p>{questionnaire.description || "Вступний текст ще не додано."}</p></div>
                <span className={`state-chip state-chip--${questionnaire.status}`}>{questionnaire.status}</span>
              </Link>
            )) : <div className="empty-state empty-state--compact"><span className="empty-state__number">00</span><div><h2>Ще немає анкет.</h2><p>Створіть customer або guest анкету — базові питання додадуться автоматично й залишаться повністю редагованими.</p></div></div>}
          </div>
          <aside className="create-questionnaire-panel">
            <span className="eyebrow">НОВА АНКЕТА</span><h2>Почати зі структури</h2>
            <QuestionnaireCreateForm eventId={eventId} />
          </aside>
        </section>
      </AppShell>
    );
  }
  if (section === "responses") {
    const submissions = await listEventSubmissions(eventId);
    return (
      <AppShell>
        <nav aria-label="Навігаційний шлях" className="breadcrumbs"><Link href="/dashboard">Події</Link><span aria-hidden="true">/</span><Link href={`/events/${event.id}`}>{event.title}</Link><span aria-hidden="true">/</span><span aria-current="page">Відповіді</span></nav>
        <div className="page-heading"><div><span className="eyebrow">RAW CONTEXT / {String(submissions.length).padStart(2, "0")}</span><h1>Відповіді</h1><p>Сирі відповіді зберігаються незалежно від ШІ. Нічого звідси не потрапляє на Public Screen автоматично.</p></div></div>
        {submissions.length ? <div className="submission-list">{submissions.map((submission, index) => (
          <article className="submission-card" key={submission.id}>
            <header><span className="submission-card__index">{String(index + 1).padStart(2, "0")}</span><div><span className="eyebrow">{submission.questionnaire ? AUDIENCE_LABELS[submission.questionnaire.audience] : "Анкета"}</span><h2>{submission.respondent?.display_name || "Без імені"}</h2><p>{submission.questionnaire?.title || "Анкета"} · {new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(submission.submitted_at || submission.created_at))}</p></div><span className={`state-chip state-chip--${submission.status}`}>{submission.status}</span></header>
            <div className="answer-list">{submission.answers.map((answer) => {
              const isMedia = answer.question?.type === "media";
              return (
                <div className="answer-row" key={answer.id}>
                  <div>
                    <span className="answer-row__privacy">{isMedia ? `Медіафайли / ${answer.media_assets.length}` : `${answer.privacy_status} / ${answer.moderation_status}`}</span>
                    <h3>{answer.question?.prompt || "Питання"}</h3>
                  </div>
                  <div className="answer-row__content">
                    {isMedia ? (
                      answer.media_assets.length
                        ? <div className="media-review-list">{answer.media_assets.map((asset) => <MediaReviewCard asset={asset} eventId={eventId} key={asset.id} />)}</div>
                        : <p>Медіафайли ще завантажуються або не пройшли перевірку.</p>
                    ) : (
                      <>
                        <p>{answer.answer_text ?? JSON.stringify(answer.answer_json)}</p>
                        <form action={updateAnswerModerationAction.bind(null, eventId, answer.id)} className="moderation-form"><select name="privacy" defaultValue={answer.privacy_status} aria-label="Приватність"><option value="host_only">Лише ведучий</option><option value="review_required">Після перевірки</option><option value="public_allowed">Можна у public</option></select><select name="moderation" defaultValue={answer.moderation_status} aria-label="Модерація"><option value="pending">Очікує</option><option value="approved">Схвалено</option><option value="rejected">Відхилено</option></select><label><input type="checkbox" name="isUseful" defaultChecked={answer.is_useful} /> Корисне</label><label><input type="checkbox" name="doNotUse" defaultChecked={answer.do_not_use} /> Не використовувати</label><button className="text-action" type="submit">Зберегти статус →</button></form>
                        <form action={createEventKitItemFromAnswerAction.bind(null, eventId, answer.id)}><button className="button button--neutral button--outline" type="submit">Додати в Event Kit</button></form>
                      </>
                    )}
                  </div>
                </div>
              );
            })}</div>
          </article>
        ))}</div> : <section className="empty-state"><span className="empty-state__number">00</span><div><h2>Відповідей ще немає.</h2><p>Після першого public submit тут з’явиться окрема картка респондента з raw answers і privacy status.</p><Link href={`/events/${eventId}/questionnaires`} className="text-action">Перейти до анкет →</Link></div></section>}
      </AppShell>
    );
  }
  if (section === "event-kit") {
    const [items, query] = await Promise.all([listEventKitItems(eventId), searchParams]);
    return (
      <AppShell>
        <nav aria-label="Навігаційний шлях" className="breadcrumbs"><Link href="/dashboard">Події</Link><span aria-hidden="true">/</span><Link href={`/events/${event.id}`}>{event.title}</Link><span aria-hidden="true">/</span><span aria-current="page">Event Kit</span></nav>
        <div className="page-heading"><div><span className="eyebrow">EVENT KIT / {String(items.length).padStart(2, "0")}</span><h1>Event Kit</h1><p>Окремі робочі блоки, а не AI-чат. Manual path працює завжди — навіть якщо ШІ недоступний.</p></div><Link href={`/events/${eventId}/responses`} className="button button--neutral button--outline">Взяти з відповідей</Link></div>
        {query.error ? <div className="status status--error">Додайте заголовок або зміст блоку.</div> : null}
        <section className="event-kit-layout">
          <div className="event-kit-list">
            {items.length ? items.map((item, index) => (
              <article className={`event-kit-card ${item.do_not_use ? "event-kit-card--blocked" : ""}`} key={item.id}>
                <header><span className="event-kit-card__index">{String(index + 1).padStart(2, "0")}</span><div><span className="eyebrow">{EVENT_KIT_TYPE_LABELS[item.item_type]} / {item.source_type}</span><h2>{item.title || "Без назви"}</h2></div><span className={`state-chip state-chip--${item.status}`}>{item.status}</span></header>
                <form action={updateEventKitItemAction.bind(null, eventId, item.id)} className="event-kit-card__body">
                  <div className="form-field"><label className="form-field__label" htmlFor={`kit-title-${item.id}`}>Назва блоку</label><input id={`kit-title-${item.id}`} name="title" defaultValue={item.title ?? ""} /></div>
                  <div className="form-field"><label className="form-field__label" htmlFor={`kit-content-${item.id}`}>Матеріал / шпаргалка</label><textarea id={`kit-content-${item.id}`} name="content" defaultValue={item.content ?? ""} /></div>
                  <div className="kit-controls"><label><span>Статус</span><select name="status" defaultValue={item.status}><option value="draft">Чернетка</option><option value="approved">Схвалено</option><option value="rejected">Відхилено</option><option value="used">Використано</option></select></label><label><span>Приватність</span><select name="privacy" defaultValue={item.privacy_status}><option value="host_only">Лише ведучий</option><option value="review_required">Після перевірки</option><option value="public_allowed">Можна у public</option></select></label><label className="checkbox-field"><input type="checkbox" name="isUseful" defaultChecked={item.is_useful} /> Корисне</label><label className="checkbox-field"><input type="checkbox" name="doNotUse" defaultChecked={item.do_not_use} /> Не використовувати</label></div>
                  <button type="submit" className="text-action">Зберегти блок →</button>
                </form>
              </article>
            )) : <section className="empty-state empty-state--compact"><span className="empty-state__number">00</span><div><h2>Поки порожньо.</h2><p>Додайте перший блок вручну або перенесіть сильну відповідь із розділу «Відповіді».</p></div></section>}
          </div>
          <aside className="create-questionnaire-panel event-kit-create"><span className="eyebrow">MANUAL / SAFE FALLBACK</span><h2>Новий блок</h2><form action={createEventKitItemAction.bind(null, eventId)} className="editor-form"><div className="form-field"><label className="form-field__label" htmlFor="kit-new-type">Тип</label><select id="kit-new-type" name="type"><option value="story">Історія</option><option value="fact">Факт</option><option value="question">Питання</option><option value="interactive">Інтерактив</option><option value="note">Нотатка</option><option value="warning">Важливо</option><option value="other">Інше</option></select></div><div className="form-field"><label className="form-field__label" htmlFor="kit-new-title">Назва</label><input id="kit-new-title" name="title" /></div><div className="form-field"><label className="form-field__label" htmlFor="kit-new-content">Матеріал</label><textarea id="kit-new-content" name="content" /></div><button className="button button--brand button--solid" type="submit">Додати в Event Kit</button></form></aside>
        </section>
      </AppShell>
    );
  }
  if (section === "rehearsal" || section === "live") {
    const requestedMode = section === "rehearsal" ? "rehearsal" : "live";
    const [items, session, liveState] = await Promise.all([listEventKitItems(eventId), getActiveLiveSession(eventId), getHostLiveState(eventId)]);
    const candidates = items.filter((item) => (item.status === "approved" || item.status === "used") && item.privacy_status === "public_allowed" && !item.do_not_use);
    const screenUrl = publicScreenUrl(eventId);
    const sessionMatches = session?.mode === requestedMode;
    return (
      <AppShell>
        <nav aria-label="Навігаційний шлях" className="breadcrumbs"><Link href="/dashboard">Події</Link><span aria-hidden="true">/</span><Link href={`/events/${event.id}`}>{event.title}</Link><span aria-hidden="true">/</span><span aria-current="page">{config.title}</span></nav>
        <div className="page-heading"><div><span className="eyebrow">{requestedMode === "live" ? "BATTLE MODE" : "SAFE PREVIEW"}</span><h1>{config.title}</h1><p>{config.description}</p></div>{sessionMatches ? <Link href={screenUrl} target="_blank" className="button button--neutral button--outline">Відкрити Public Screen ↗</Link> : null}</div>
        {!sessionMatches ? <section className="live-start"><span className="live-start__signal" /><h2>{session ? `Зараз активна сесія: ${session.mode}.` : requestedMode === "live" ? "Готові починати?" : "Перевіримо все без ризику."}</h2><p>{requestedMode === "live" ? "Після старту Public Screen отримає лише явно показані схвалені блоки." : "Репетиція використовує той самий sanitized public pipeline, але чітко позначена як тест."}</p><form action={startLiveSessionAction.bind(null, eventId, requestedMode)}><button className="button button--brand button--solid" type="submit">{session ? `Перемкнути на ${requestedMode}` : `Почати ${requestedMode}`}</button></form></section> : <section className="live-console">
          <aside className="live-current"><span className="eyebrow">ЗАРАЗ НА ЕКРАНІ / REV {liveState?.revision ?? 0}</span><div className="live-current__preview"><span>{liveState?.mode || "idle"}</span><h2>{liveState?.public_payload.title || "Екран очищено"}</h2><p>{liveState?.public_payload.content || "Public Screen тримає нейтральний brand state."}</p></div><div className="live-current__controls"><form action={clearPublicScreenAction.bind(null, eventId)}><button className="button button--neutral button--outline" type="submit">Очистити екран</button></form><form action={endLiveSessionAction.bind(null, eventId)}><button className="button button--danger button--solid" type="submit">Завершити сесію</button></form></div><div className="share-link"><code>{screenUrl}</code></div></aside>
          <div className="live-candidates"><div className="section-heading"><div><span className="eyebrow">READY TO SHOW / {String(candidates.length).padStart(2, "0")}</span><h2>Схвалені блоки</h2></div></div>{candidates.length ? candidates.map((item, index) => <article className="live-item" key={item.id}><span className="live-item__index">{String(index + 1).padStart(2, "0")}</span><div><span className="eyebrow">{EVENT_KIT_TYPE_LABELS[item.item_type]}</span><h3>{item.title || "Без назви"}</h3><p>{item.content}</p></div><form action={showEventKitItemAction.bind(null, eventId, item.id)}><button className="button button--brand button--solid" type="submit">Показати →</button></form></article>) : <div className="status">Немає блоків зі статусом approved + public_allowed. Підготуйте їх у Event Kit.</div>}</div>
        </section>}
      </AppShell>
    );
  }
  if (section === "backup") {
    return (
      <AppShell>
        <nav aria-label="Навігаційний шлях" className="breadcrumbs"><Link href="/dashboard">Події</Link><span aria-hidden="true">/</span><Link href={`/events/${event.id}`}>{event.title}</Link><span aria-hidden="true">/</span><span aria-current="page">Backup</span></nav>
        <div className="page-heading"><div><span className="eyebrow">BATTLE FALLBACK</span><h1>Backup</h1><p>Завантажте пакет до виїзду. Він не залежить від AI, realtime або доступності TYAMA під час заходу.</p></div></div>
        <section className="backup-grid">
          <a className="backup-card" href={`/events/${eventId}/backup/responses.csv`} download><span>01 / CSV</span><h2>Усі відповіді</h2><p>Рядок на кожну raw answer із privacy та moderation status.</p><strong>Завантажити →</strong></a>
          <a className="backup-card" href={`/events/${eventId}/backup/snapshot.json`} download><span>02 / JSON</span><h2>Snapshot події</h2><p>Event, анкети, submissions і Event Kit в одному машинозчитуваному файлі.</p><strong>Завантажити →</strong></a>
          <Link className="backup-card" href={`/events/${eventId}/backup/print`} target="_blank"><span>03 / PRINT</span><h2>Event Kit офлайн</h2><p>Відкрити clean сторінку й зберегти через браузер як PDF.</p><strong>Відкрити →</strong></Link>
          <Link className="backup-card" href={`/events/${eventId}/responses`}><span>04 / MEDIA</span><h2>Приватні медіа</h2><p>Переглянути й завантажити перевірені фото, відео та аудіо без відкриття Storage назовні.</p><strong>Відкрити відповіді →</strong></Link>
        </section>
        <aside className="backup-check"><span className="eyebrow">ПЕРЕД ВИЇЗДОМ</span><p>CSV ✓ &nbsp; JSON ✓ &nbsp; PDF/PRINT ✓ &nbsp; потрібні медіа локально ✓ &nbsp; зарядка/HDMI ✓</p></aside>
      </AppShell>
    );
  }
  return (
    <AppShell>
      <nav aria-label="Навігаційний шлях" className="breadcrumbs">
        <Link href="/dashboard">Події</Link><span aria-hidden="true">/</span><Link href={`/events/${event.id}`}>{event.title}</Link><span aria-hidden="true">/</span><span aria-current="page">{config.title}</span>
      </nav>
      <div className="page-heading page-heading--editor"><div><span className="eyebrow">VERTICAL SLICE / NEXT</span><h1>{config.title}</h1><p>{config.description}</p></div></div>
      <section className="empty-state"><span className="empty-state__number">→</span><div><h2>Основа готова.</h2><p>Цей розділ підключається наступним робочим slice після Auth + Event.</p><Link href={`/events/${event.id}`} className="text-action">Назад до події →</Link></div></section>
    </AppShell>
  );
}
