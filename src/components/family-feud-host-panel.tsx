import { replaceFamilyFeudBoardSlotAction, selectFamilyFeudGemAction } from "@/app/actions/event-kit";
import { hideFamilyFeudGemAction, revealFamilyFeudAnswerAction, revealFamilyFeudGemAuthorAction, showFamilyFeudGemAction } from "@/app/actions/live";
import { findFamilyFeudAnalysis, findFamilyFeudOriginal, normalizeFamilyFeudValue } from "@/lib/event-kit/family-feud";
import type { EventKitItem } from "@/lib/event-kit/types";
import type { EventSubmission } from "@/lib/responses/data";

type PublicBoardAnswer = { label: string; points: number; groupKey?: string };

function publicBoard(item: EventKitItem): PublicBoardAnswer[] {
  if (!Array.isArray(item.data.answers)) return [];
  return item.data.answers.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const answer = candidate as Record<string, unknown>;
    const label = String(answer.label ?? "").trim();
    const points = Number(answer.points ?? 0);
    return label && Number.isFinite(points) ? [{ label, points, groupKey: String(answer.group_key ?? normalizeFamilyFeudValue(label)) }] : [];
  });
}

export function FamilyFeudHostPanel({ eventId, item, submissions, liveControls = false }: {
  eventId: string;
  item: EventKitItem;
  submissions: EventSubmission[];
  liveControls?: boolean;
}) {
  if (item.data.interactive_kind !== "family_feud") return null;
  const generator = String(item.data.generator ?? "");
  const supported = generator === "family_feud_v3" || generator === "family_feud_v4";
  const isV4 = generator === "family_feud_v4";
  const board = publicBoard(item);
  if (!supported) return <p className="family-host-panel__legacy">Старе табло: показ і послідовне відкриття працюють.</p>;

  const sourceIds = item.source_refs.filter((ref) => ref.type === "answer").map((ref) => ref.id);
  const analysis = findFamilyFeudAnalysis(submissions, String(item.data.prompt ?? item.content ?? ""), sourceIds);
  const boardKeys = new Set(board.map((answer) => answer.groupKey));
  const otherGroups = analysis?.groups.filter((group) => !boardKeys.has(group.key)) ?? [];
  const selectedId = item.source_refs.find((ref) => ref.type === "family_feud_selected_gem")?.id;
  const selected = selectedId ? findFamilyFeudOriginal(submissions, selectedId) : null;
  const revealedIndexes = new Set(Array.isArray(item.data.revealed_indexes) ? item.data.revealed_indexes.map(Number) : []);

  return (
    <section className="family-host-panel">
      <header><span className="eyebrow">100 ЗІ 100 / КЕРУВАННЯ</span><h3>{String(item.data.prompt ?? item.content ?? "Питання")}</h3>{analysis ? <p>{analysis.usableCount} відповідей • {board.length} на табло • ще {otherGroups.length} варіантів</p> : null}</header>
      <ol className="family-host-top">
        {board.map((answer, index) => <li key={`${answer.label}-${index}`}><span>{index + 1}</span><strong>{answer.label}</strong><b>{answer.points}</b>{isV4 && liveControls ? <form action={revealFamilyFeudAnswerAction.bind(null, eventId, item.id, index)}><button className="button button--neutral button--outline" type="submit">{revealedIndexes.has(index) ? "Відкрито" : "Відкрити"}</button></form> : null}</li>)}
      </ol>
      <div className="family-host-inspectors">
        <details>
          <summary>Усі відповіді</summary>
          <div className="family-host-groups">
            {analysis?.groups.map((group) => <article key={group.key}><strong>{group.label} — {group.points}</strong><ul>{group.originals.map((original) => <li key={original.id}>{original.value}</li>)}</ul>{isV4 && !boardKeys.has(group.key) ? <div className="board-replace"><span>Замінити на табло:</span>{board.map((_, slot) => <form action={replaceFamilyFeudBoardSlotAction.bind(null, eventId, item.id, group.key, slot)} key={slot}><button type="submit" aria-label={`Замінити позицію ${slot + 1}`}>{slot + 1}</button></form>)}</div> : null}</article>)}
          </div>
        </details>
        <details>
          <summary>Цікаві відповіді</summary>
          {analysis?.gems.length ? <div className="family-host-gems">{analysis.gems.map((gem) => <article key={gem.id}><p>«{gem.value}»</p><form action={selectFamilyFeudGemAction.bind(null, eventId, item.id, gem.id)}><button className="text-action" type="submit">Додати в гру</button></form></article>)}</div> : <p>Безпечних цікавих відповідей поза табло поки немає.</p>}
        </details>
      </div>
      {selected ? <div className="family-host-selected"><span className="eyebrow">ОБРАНА ЦІКАВА ВІДПОВІДЬ</span><blockquote>«{selected.value}»</blockquote>{liveControls ? <div className="inline-actions"><form action={showFamilyFeudGemAction.bind(null, eventId, item.id)}><button className="button button--brand button--solid" type="submit">Показати</button></form><form action={hideFamilyFeudGemAction.bind(null, eventId, item.id)}><button className="button button--neutral button--outline" type="submit">Приховати</button></form><form action={revealFamilyFeudGemAuthorAction.bind(null, eventId, item.id)}><button className="button button--neutral button--outline" type="submit">Показати автора</button></form></div> : <p>Автор прихований. Керування показом доступне в Репетиції та Live.</p>}</div> : null}
    </section>
  );
}
