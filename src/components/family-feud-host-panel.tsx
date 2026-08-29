import { selectFamilyFeudGemAction } from "@/app/actions/event-kit";
import { hideFamilyFeudGemAction, revealFamilyFeudGemAuthorAction, showFamilyFeudGemAction } from "@/app/actions/live";
import { findFamilyFeudAnalysis, findFamilyFeudOriginal, normalizeFamilyFeudValue } from "@/lib/event-kit/family-feud";
import type { EventKitItem } from "@/lib/event-kit/types";
import type { EventSubmission } from "@/lib/responses/data";

type PublicBoardAnswer = { label: string; points: number };

function publicBoard(item: EventKitItem): PublicBoardAnswer[] {
  if (!Array.isArray(item.data.answers)) return [];
  return item.data.answers.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const answer = candidate as Record<string, unknown>;
    const label = String(answer.label ?? "").trim();
    const points = Number(answer.points ?? 0);
    return label && Number.isFinite(points) ? [{ label, points }] : [];
  });
}

export function FamilyFeudHostPanel({
  eventId,
  item,
  submissions,
  liveControls = false,
}: {
  eventId: string;
  item: EventKitItem;
  submissions: EventSubmission[];
  liveControls?: boolean;
}) {
  if (item.data.interactive_kind !== "family_feud") return null;
  const isV3 = item.data.generator === "family_feud_v3";
  const board = publicBoard(item);
  if (!isV3) return <p className="family-host-panel__legacy">Legacy board: показ і послідовне відкриття працюють; Gems доступні лише для v3.</p>;

  const sourceIds = item.source_refs.filter((ref) => ref.type === "answer").map((ref) => ref.id);
  const analysis = findFamilyFeudAnalysis(submissions, String(item.data.prompt ?? item.content ?? ""), sourceIds);
  const selectedId = item.source_refs.find((ref) => ref.type === "family_feud_selected_gem")?.id;
  const selected = selectedId ? findFamilyFeudOriginal(submissions, selectedId) : null;

  return (
    <section className="family-host-panel">
      <header><span className="eyebrow">100 ЗІ 100 / HOST CONTROL</span><h3>{String(item.data.prompt ?? item.content ?? "Питання")}</h3></header>
      <ol className="family-host-top">
        {board.map((answer, index) => <li key={`${answer.label}-${index}`}><span>{index + 1}</span><strong>{answer.label}</strong><b>{answer.points}</b></li>)}
      </ol>
      <div className="family-host-inspectors">
        <details>
          <summary>VIEW ORIGINALS</summary>
          <div className="family-host-groups">
            {board.map((answer) => {
              const group = analysis?.groups.find((candidate) => candidate.key === normalizeFamilyFeudValue(answer.label));
              return <article key={answer.label}><strong>{answer.label} — {answer.points}</strong>{group?.originals.length
                ? <ul>{group.originals.map((original) => <li key={original.id}>{original.value}</li>)}</ul>
                : <p>Originals недоступні або були перемодеровані.</p>}</article>;
            })}
          </div>
        </details>
        <details>
          <summary>VIEW GEMS</summary>
          {analysis?.gems.length ? <div className="family-host-gems">{analysis.gems.map((gem) => <article key={gem.id}><p>«{gem.value}»</p><form action={selectFamilyFeudGemAction.bind(null, eventId, item.id, gem.id)}><button className="text-action" type="submit">USE IN GAME</button></form></article>)}</div> : <p>Безпечних non-TOP Gems поки немає.</p>}
        </details>
      </div>
      {selected ? <div className="family-host-selected"><span className="eyebrow">SELECTED GEM</span><blockquote>«{selected.value}»</blockquote>{liveControls ? <div className="inline-actions"><form action={showFamilyFeudGemAction.bind(null, eventId, item.id)}><button className="button button--brand button--solid" type="submit">SHOW GEM</button></form><form action={hideFamilyFeudGemAction.bind(null, eventId, item.id)}><button className="button button--neutral button--outline" type="submit">HIDE GEM</button></form><form action={revealFamilyFeudGemAuthorAction.bind(null, eventId, item.id)}><button className="button button--neutral button--outline" type="submit">REVEAL AUTHOR</button></form></div> : <p>Автор прихований. Керування показом буде в Rehearsal/Live.</p>}</div> : null}
    </section>
  );
}
