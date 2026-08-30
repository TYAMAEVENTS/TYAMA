import { mutateShowSetItemAction, prepareShowSetAction } from "@/app/actions/show-set";
import type { ShowSet } from "@/lib/show-set/types";

const READINESS: Record<string, string> = { ready: "Готово", needs_attention: "Потребує уваги", blocked: "Заблоковано", stale: "Джерело застаріло" };

export function ShowBuilder({ eventId, showSet }: { eventId: string; showSet: ShowSet | null }) {
  const items = [...(showSet?.show_set_items ?? [])].sort((a, b) => (a.host_order ?? 999999) - (b.host_order ?? 999999));
  const runnable = items.filter((item) => item.included && item.readiness === "ready" && item.public_eligible);
  const attention = items.filter((item) => item.readiness !== "ready" || !item.public_eligible || item.attention_state !== "unchanged");
  const version = showSet?.row_version ?? 0;
  return <section className="show-builder" aria-labelledby="show-builder-title">
    <header className="show-builder__header"><div><span className="eyebrow">SHOW SET / {String(runnable.length).padStart(2, "0")} У ПРОГРАМІ</span><h1 id="show-builder-title">Порядок шоу</h1><p>ТЯМА готує готове автоматично. Ви змінюєте лише порядок і винятки.</p></div><form action={prepareShowSetAction.bind(null,eventId,showSet?.row_version ?? 0)}><button className="button button--brand button--solid" type="submit">Підготувати шоу</button></form></header>
    {showSet?.prepared_at ? <p className="show-builder__meta">Ревізія {showSet.show_set_revisions[0]?.revision_number ?? 0} · збережено {new Date(showSet.prepared_at).toLocaleString("uk-UA")}</p> : null}
    <div className="show-builder__list">{runnable.map((item,index) => <article className="show-row" key={item.id}>
      <span className="show-row__number">{String(index+1).padStart(2,"0")}</span><div className="show-row__main"><span className="eyebrow">{item.event_kit_items?.item_type} · {item.attention_state === "new" ? "NEW" : READINESS[item.readiness]}</span><h2>{item.event_kit_items?.title || "Без назви"}</h2></div>
      <div className="show-row__actions"><form action={mutateShowSetItemAction.bind(null,eventId,item.id,"up",version)}><button aria-label="Підняти вище" className="show-icon-button">↑</button></form><form action={mutateShowSetItemAction.bind(null,eventId,item.id,"down",version)}><button aria-label="Опустити нижче" className="show-icon-button">↓</button></form><form action={mutateShowSetItemAction.bind(null,eventId,item.id,"exclude",version)}><button className="text-action">Виключити</button></form></div>
    </article>)}</div>
    {attention.length ? <aside className="show-attention"><span className="eyebrow">ПОТРЕБУЄ УВАГИ / {attention.length}</span>{attention.map(item => <article key={item.id}><div><strong>{item.event_kit_items?.title || "Без назви"}</strong><p>{item.blocker_reason || (item.attention_state === "new" ? "Новий готовий блок додано в кінець програми." : "Перевірте зміну джерела.")}</p></div>{item.readiness === "ready" && item.public_eligible && !item.included ? <form action={mutateShowSetItemAction.bind(null,eventId,item.id,"restore",showSet?.row_version ?? 0)}><button className="button button--neutral button--outline">Повернути</button></form> : null}</article>)}</aside> : null}
  </section>;
}
