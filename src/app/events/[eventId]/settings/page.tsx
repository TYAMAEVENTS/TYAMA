import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setEventArchivedAction } from "@/app/actions/events";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { EventSettingsForm } from "./event-settings-form";

export const metadata: Metadata = { title: "Налаштування події" };

export default async function EventSettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  await requireUser();
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event) notFound();
  return (
    <AppShell>
      <nav aria-label="Навігаційний шлях" className="breadcrumbs"><Link href="/dashboard">Події</Link><span>/</span><Link href={`/events/${event.id}`}>{event.title}</Link><span>/</span><span aria-current="page">Налаштування</span></nav>
      <div className="page-heading"><div><span className="eyebrow">EVENT / SETTINGS</span><h1>Налаштування</h1><p>Дані події та приватні нотатки. Архівування не видаляє матеріали.</p></div></div>
      <section className="settings-layout">
        <div className="editor-panel"><EventSettingsForm event={event} /></div>
        <aside className="danger-panel">
          <span className="eyebrow">REVERSIBLE ACTION</span>
          <h2>{event.status === "archived" ? "Повернути подію" : "Архівувати подію"}</h2>
          <p>{event.status === "archived" ? "Подія знову з’явиться на головному екрані як чернетка." : "Подія зникне зі списку активних. Анкети, відповіді, медіа та Event Kit залишаться в базі."}</p>
          <form action={setEventArchivedAction.bind(null, event.id, event.status !== "archived")} noValidate>
            <button className={`button ${event.status === "archived" ? "button--neutral button--outline" : "button--danger button--solid"}`} type="submit">{event.status === "archived" ? "Відновити подію" : "Архівувати"}</button>
          </form>
        </aside>
      </section>
    </AppShell>
  );
}
