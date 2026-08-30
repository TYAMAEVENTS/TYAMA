import { showRuntimeAction, startShowSessionAction } from "@/app/actions/show-set";
import type { LiveState } from "@/lib/live/types";
import type { RehearsalState, ShowSession, ShowSet } from "@/lib/show-set/types";

export function MobileLiveConsole({ eventId, mode, showSet, session, liveState, rehearsalState }: { eventId:string; mode:"rehearsal"|"live"; showSet:ShowSet|null; session:ShowSession|null; liveState:LiveState|null; rehearsalState:RehearsalState|null }) {
  const matches=session?.mode===mode;
  const revision=showSet?.show_set_revisions[0];
  if(!matches) return <section className="live-start"><span className="live-start__signal"/><h2>{session?`Активна ${session.mode === "live" ? "Live-сесія" : "репетиція"}`:mode==="live"?"Шоу готове до ефіру?":"Перевіримо точний порядок приватно"}</h2><p>{session?"Спочатку явно завершіть активний режим. TYAMA не замінює його автоматично.":"Старт фіксує ревізію Show Set. Подальша підготовка не змінить цей запуск."}</p>{!session&&revision?<form action={startShowSessionAction.bind(null,eventId,mode,revision.id)}><button className="button button--brand button--solid">{mode==="live"?"Почати Live":"Почати репетицію"}</button></form>:null}</section>;
  const version=session.runtime_version;
  const state=mode==="live"?liveState?.public_payload:rehearsalState?.private_payload;
  const title=typeof state?.title==="string"?state.title:"Обкладинка";
  return <section className="mobile-live" data-mode={mode}>
    <header className="mobile-live__status"><div><span className="mobile-live__dot"/> {mode==="live"?"LIVE":"РЕПЕТИЦІЯ"}</div><strong>{session.current_position+1} / {showSet?.show_set_items.filter(x=>x.included&&x.readiness==="ready").length??0}</strong><span>{session.current_stage}</span></header>
    <div className="mobile-live__now"><span className="eyebrow">ЗАРАЗ</span><h1>{title}</h1><p>Стан підтверджено сервером · rev {version}</p></div>
    <div className="mobile-live__primary"><form action={showRuntimeAction.bind(null,eventId,session.id,"previous",version)}><button>← Попередній</button></form><form action={showRuntimeAction.bind(null,eventId,session.id,"next",version)}><button>Наступний →</button></form><form action={showRuntimeAction.bind(null,eventId,session.id,"question",version)}><button>Показати питання</button></form><form action={showRuntimeAction.bind(null,eventId,session.id,"reveal",version)}><button className="mobile-live__reveal">Відкрити відповідь</button></form></div>
    <div className="mobile-live__safety"><form action={showRuntimeAction.bind(null,eventId,session.id,"clear",version)}><button>Сховати екран</button></form><form action={showRuntimeAction.bind(null,eventId,session.id,"emergency_cover",version)}><button>Аварійна заставка</button></form><form action={showRuntimeAction.bind(null,eventId,session.id,"end",version)}><button className="mobile-live__end">Завершити {mode==="live"?"Live":"репетицію"}</button></form></div>
    <footer>Show Set {session.snapshot_hash?.slice(0,8)} · з’єднання: сервер доступний</footer>
  </section>;
}
