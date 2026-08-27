import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { listEvents } from "@/lib/events/data";
import { EVENT_TYPE_LABELS } from "@/lib/events/types";
import { formatEventDate } from "@/lib/format";

export const metadata: Metadata = { title: "Події" };

export default async function DashboardPage() {
  await requireUser();
  const events = await listEvents();

  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">HOST / DASHBOARD</span>
          <h1>Події</h1>
        </div>
        <Link href="/events/new" className="button button--brand button--solid">Створити подію</Link>
      </div>

      {events.length === 0 ? (
        <section className="empty-state">
          <span className="empty-state__number">00</span>
          <div>
            <h2>Поки тихо.</h2>
            <p>Створіть першу подію — ТЯМА збере для неї окремий контекст.</p>
            <Link href="/events/new" className="text-action">Створити першу подію →</Link>
          </div>
        </section>
      ) : (
        <div className="event-list" aria-label="Список подій">
          {events.map((event, index) => (
            <article className="event-row" key={event.id}>
              <span className="event-row__index">{String(index + 1).padStart(2, "0")}</span>
              <div className="event-row__main">
                <span className="eyebrow">{EVENT_TYPE_LABELS[event.event_type]} / {event.status}</span>
                <h2><Link href={`/events/${event.id}`}>{event.title}</Link></h2>
                <p>{event.client_name || "Клієнт ще не вказаний"}</p>
              </div>
              <div className="event-row__meta">
                <span>{formatEventDate(event.event_date)}</span>
                <Link href={`/events/${event.id}`} className="text-action">Відкрити →</Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
