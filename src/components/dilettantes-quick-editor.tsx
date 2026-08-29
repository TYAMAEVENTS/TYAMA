import { updateDilettantesInteractiveAction } from "@/app/actions/event-kit";
import type { EventKitItem } from "@/lib/event-kit/types";

export function DilettantesQuickEditor({ eventId, item }: { eventId: string; item: EventKitItem }) {
  if (item.data.interactive_kind !== "dilettantes") return null;
  return <form action={updateDilettantesInteractiveAction.bind(null, eventId, item.id)} className="dilettantes-quick-editor" noValidate>
    <div className="form-field"><label className="form-field__label" htmlFor={`dq-${item.id}`}>Питання</label><textarea id={`dq-${item.id}`} name="question" defaultValue={String(item.data.question ?? item.content ?? "")} /></div>
    <div className="form-field"><label className="form-field__label" htmlFor={`da-${item.id}`}>Правильна відповідь</label><input id={`da-${item.id}`} name="correctAnswer" inputMode="decimal" defaultValue={String(item.data.correct_answer ?? "")} /></div>
    <div className="form-field"><label className="form-field__label" htmlFor={`dc-${item.id}`}>Завдання / наслідок <small>необов’язково</small></label><input id={`dc-${item.id}`} name="consequence" defaultValue={String(item.data.consequence ?? "")} /></div>
    <button className="button button--brand button--solid" type="submit">ЗБЕРЕГТИ</button>
  </form>;
}
