import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { EVENT_TYPE_LABELS } from "@/lib/events/types";
import { formatEventDate } from "@/lib/format";

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
  const event = await getEvent(eventId);
  if (!event) notFound();

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
        <div className="event-hero__signal"><span />КОНТЕКСТ<br />ЗБИРАЄТЬСЯ</div>
      </header>

      <section className="workspace-grid" aria-label="Розділи події">
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
