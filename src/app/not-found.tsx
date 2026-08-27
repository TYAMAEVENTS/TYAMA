import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Сторінку не знайдено" };

export default function NotFound() {
  return <main className="route-state"><span className="route-state__code">404</span><h1>Тут нічого немає.</h1><p>Можливо, посилання застаріло або сторінку перенесли.</p><Link className="button button--brand button--solid" href="/dashboard">До подій</Link></main>;
}
