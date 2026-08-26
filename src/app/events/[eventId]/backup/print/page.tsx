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
  const usable = items.filter((item) => item.status !== "rejected" && !item.do_not_use);
  return (
    <main className="print-kit">
      <header><span>ТЯМА / BATTLE BACKUP</span><span>{new Date().toLocaleString("uk-UA")}</span></header>
      <section className="print-kit__title"><span className="eyebrow">EVENT KIT / {String(usable.length).padStart(2, "0")}</span><h1>{event.title}</h1><p>{event.client_name} · {event.event_date} · {event.location}</p></section>
      <div className="print-kit__items">{usable.map((item, index) => <article key={item.id}><span className="print-kit__index">{String(index + 1).padStart(2, "0")}</span><div><span className="eyebrow">{EVENT_KIT_TYPE_LABELS[item.item_type]} / {item.privacy_status}</span><h2>{item.title}</h2><p>{item.content}</p></div></article>)}</div>
      <footer>Збережіть сторінку як PDF або роздрукуйте до виїзду на подію.</footer>
    </main>
  );
}
