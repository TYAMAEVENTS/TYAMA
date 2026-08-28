import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ShareTools } from "@/components/share-tools";
import { requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { listEventKitItems } from "@/lib/event-kit/data";
import { EVENT_TYPE_LABELS } from "@/lib/events/types";
import { formatEventDate } from "@/lib/format";
import { listQuestionnaires } from "@/lib/questionnaires/data";
import { publicQuestionnaireUrl } from "@/lib/questionnaires/tokens";
import { listEventSubmissions } from "@/lib/responses/data";

export const metadata: Metadata = { title: "Робочий простір події" };

const sections = [
  ["01", "Анкети", "Customer + guest, публічні посилання і QR", "questionnaires"],
  ["02", "Відповіді", "Raw context, люди, файли та модерація", "responses"],
  ["03", "Event Kit", "Відібрані історії, питання й інтерактиви", "event-kit"],
  ["04", "Репетиція", "Перевірка порядку й Public Screen", "rehearsal"],
  ["05", "Live Mode", "Показати, далі, очистити — без метушні", "live"],
  ["06", "Backup", "CSV, JSON, друк і критичні медіа", "backup"],
] as const;

export default async function EventWorkspacePage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireUser();
  const { eventId } = await params;
  const [event, questionnaires, submissions, kitItems] = await Promise.all([
    getEvent(eventId),
    listQuestionnaires(eventId),
    listEventSubmissions(eventId),
    listEventKitItems(eventId),
  ]);
  if (!event) notFound();
  const guestQuestionnaires = questionnaires.filter((questionnaire) => questionnaire.audience === "guest" || questionnaire.audience === "other");
  const publishedGuest = [...guestQuestionnaires].reverse().find((questionnaire) => questionnaire.status === "published");
  const latestGuest = guestQuestionnaires.at(-1);
  const readyKitItems = kitItems.filter((item) => (item.status === "approved" || item.status === "used") && item.privacy_status === "public_allowed" && !item.do_not_use);

  return (
    <AppShell>
      <nav aria-label="Навігаційний шлях" className="breadcrumbs">
        <Link href="/dashboard">Події</Link><span aria-hidden="true">/</span><span aria-current="page">{event.title}</span>
      </nav>
      <header className="event-hero">
        <div>
          <span className="eyebrow">{EVENT_TYPE_LABELS[event.event_type]} / {event.status}</span>
          <h1>{event.title}</h1>
          <p>{event.client_name || "Клієнти ще не вказані"} · {formatEventDate(event.event_date)}</p>
        </div>
        <div className="event-hero__tools"><div className="event-hero__signal"><span />КОНТЕКСТ<br />ЗБИРАЄТЬСЯ</div><Link className="button button--neutral button--outline" href={`/events/${event.id}/settings`}>Налаштування</Link></div>
      </header>

      <section className="event-launchpad" aria-labelledby="launchpad-title">
        <header><div><span className="eyebrow">ШВИДКИЙ СТАРТ</span><h2 id="launchpad-title">Що потрібно зараз?</h2></div><p>Три кроки ведучого: дати гостям QR, переглянути відповіді, запустити підготовлений матеріал.</p></header>
        <div className="event-launchpad__steps">
          <article>
            <span className="event-launchpad__number">1</span>
            <div><span className="eyebrow">ГОСТІ</span><h3>{publishedGuest ? "QR готовий" : latestGuest ? "Анкету треба опублікувати" : "Створіть анкету гостей"}</h3><p>{publishedGuest ? "Покажіть QR на екрані або скопіюйте приватне посилання." : "Після публікації тут одразу з’явиться QR."}</p></div>
            <Link className="button button--brand button--solid" href={publishedGuest ? `/events/${event.id}/questionnaires/${publishedGuest.id}` : latestGuest ? `/events/${event.id}/questionnaires/${latestGuest.id}` : `/events/${event.id}/questionnaires`}>{publishedGuest ? "Відкрити анкету й QR" : latestGuest ? "Перевірити й опублікувати" : "Створити анкету"}</Link>
          </article>
          <article>
            <span className="event-launchpad__number">2</span>
            <div><span className="eyebrow">ВІДПОВІДІ / {submissions.length}</span><h3>{submissions.length ? "Є що переглянути" : "Чекаємо відповіді"}</h3><p>Три швидкі рішення: у роботу, можна на екран або не використовувати.</p></div>
            <Link className="button button--neutral button--outline" href={`/events/${event.id}/responses`}>Переглянути відповіді</Link>
          </article>
          <article>
            <span className="event-launchpad__number">3</span>
            <div><span className="eyebrow">ЕФІР / {readyKitItems.length} ГОТОВО</span><h3>{readyKitItems.length ? "Можна репетирувати" : "Підготуйте матеріал"}</h3><p>{readyKitItems.length ? "Спочатку безпечно перевірте екран у режимі репетиції." : "Додайте сильні відповіді в Event Kit."}</p></div>
            <Link className="button button--neutral button--outline" href={readyKitItems.length ? `/events/${event.id}/rehearsal` : `/events/${event.id}/event-kit`}>{readyKitItems.length ? "Почати репетицію" : "Відкрити Event Kit"}</Link>
          </article>
        </div>
        {publishedGuest ? <details className="event-launchpad__share"><summary>Показати QR і посилання гостям</summary><ShareTools url={publicQuestionnaireUrl(publishedGuest.id)} label="Анкета для гостей" /></details> : null}
      </section>

      <div className="section-heading section-heading--compact"><div><span className="eyebrow">УСІ ІНСТРУМЕНТИ</span><h2>Робочі розділи</h2></div></div>
      <section className="workspace-grid workspace-grid--compact" aria-label="Розділи події">
        {sections.map(([index, title, description, route]) => (
          <Link className="workspace-card" href={`/events/${event.id}/${route}`} key={route}>
            <span className="workspace-card__index">{index}</span>
            <h2>{title}</h2>
            <p>{description}</p>
            <span className="workspace-card__action">Відкрити →</span>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
