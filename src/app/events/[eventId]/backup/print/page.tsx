import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { listEventKitItems } from "@/lib/event-kit/data";
import { EVENT_KIT_TYPE_LABELS } from "@/lib/event-kit/types";

export const metadata: Metadata = { title: "Printable Event Kit" };

export default async function PrintableEventKitPage({ params }: { params: Promise<{ eventId: string }> }) {
  const user = await requireUser();
  const { eventId } = await params;
  const [event, items] = await Promise.all([getEvent(eventId), listEventKitItems(eventId)]);
  if (!event || event.host_id !== user.id) notFound();
  const program = items.filter((item) => (item.status === "approved" || item.status === "used") && !item.do_not_use && item.item_type !== "warning");
  const safety = items.filter((item) => item.do_not_use || item.item_type === "warning");
  return (
    <main className="print-kit">
      <header><span>ТЯМА / BATTLE BACKUP</span><span>{new Date().toLocaleString("uk-UA")}</span></header>
      <section className="print-kit__title"><span className="eyebrow">APPROVED PROGRAM / {String(program.length).padStart(2, "0")}</span><h1>{event.title}</h1><p>{event.client_name} · {event.event_date} · {event.location}</p></section>
      <div className="print-kit__items">{program.map((item, index) => <article key={item.id}><span className="print-kit__index">{String(index + 1).padStart(2, "0")}</span><div><span className="eyebrow">{EVENT_KIT_TYPE_LABELS[item.item_type]} / {item.status} / {item.privacy_status}</span><h2>{item.title}</h2><p>{item.content}</p></div></article>)}</div>
      {safety.length ? <section className="print-kit__safety"><span className="eyebrow">НЕ ВИКОРИСТОВУВАТИ / ПОПЕРЕДЖЕННЯ</span>{safety.map((item) => <article key={item.id}><strong>{item.title || EVENT_KIT_TYPE_LABELS[item.item_type]}</strong><p>{item.content}</p></article>)}</section> : null}
      <footer>Збережіть сторінку як PDF або роздрукуйте до виїзду на подію.</footer>
    </main>
  );
}
