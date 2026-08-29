import { revealWhoSaidAuthorAction } from "@/app/actions/live";
import { findWhoSaidCandidate } from "@/lib/event-kit/who-said";
import type { EventKitItem } from "@/lib/event-kit/types";
import type { EventSubmission } from "@/lib/responses/data";

export function WhoSaidHostPanel({ eventId, item, submissions, liveControls = false }: {
  eventId: string;
  item: EventKitItem;
  submissions: EventSubmission[];
  liveControls?: boolean;
}) {
  if (item.data.generator !== "who_said_v3") return null;
  const answerId = item.source_refs.find((ref) => ref.type === "answer")?.id;
  const candidate = answerId ? findWhoSaidCandidate(submissions, answerId) : null;
  if (!candidate) return <p className="status">Ця відповідь більше не доступна після модерації.</p>;
  return <section className="who-said-host-panel"><span className="eyebrow">ХТО ЦЕ СКАЗАВ?</span><blockquote>«{candidate.quote}»</blockquote><p>{candidate.selfieAssetId ? "Селфі готове до показу після відкриття автора." : "Без фото"}</p>{liveControls ? <form action={revealWhoSaidAuthorAction.bind(null, eventId, item.id)}><button className="button button--brand button--solid" type="submit">Показати автора</button></form> : <small>Ім’я та селфі приховані до явної дії ведучого.</small>}</section>;
}
