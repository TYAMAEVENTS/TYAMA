import Image from "next/image";
import Link from "next/link";
import { createEventKitItemFromMediaAction } from "@/app/actions/event-kit";
import { updateMediaModerationAction } from "@/app/actions/moderation";
import type { MediaAsset } from "@/lib/media/types";

function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(size / 1024))} КБ`;
}

export function MediaReviewCard({ eventId, asset }: { eventId: string; asset: MediaAsset }) {
  const source = `/api/media/${asset.id}`;
  return (
    <article className="media-review-card">
      <header><div><span className="eyebrow">{asset.kind} / {formatBytes(asset.size_bytes)}</span><h4>{asset.original_filename || "Файл без назви"}</h4></div><span className={`state-chip state-chip--${asset.status}`}>{asset.status}</span></header>
      {asset.status === "ready" ? <div className="media-review-card__preview">
        {asset.kind === "image" ? <Image src={source} alt={asset.original_filename || "Фото з анкети"} width={720} height={480} unoptimized /> : null}
        {asset.kind === "video" ? <video src={source} controls preload="metadata">Ваш браузер не підтримує відео.</video> : null}
        {asset.kind === "audio" ? <audio src={source} controls preload="metadata">Ваш браузер не підтримує аудіо.</audio> : null}
      </div> : <p className="status">Файл ще перевіряється або був відхилений.</p>}
      {asset.status === "ready" ? <div className="media-review-card__actions">
        <form action={updateMediaModerationAction.bind(null, eventId, asset.id)} className="moderation-form">
          <select name="privacy" defaultValue={asset.privacy_status} aria-label="Приватність медіа"><option value="host_only">Лише ведучий</option><option value="review_required">Після перевірки</option><option value="public_allowed">Можна у public</option></select>
          <select name="moderation" defaultValue={asset.moderation_status} aria-label="Модерація медіа"><option value="pending">Очікує</option><option value="approved">Схвалено</option><option value="rejected">Відхилено</option></select>
          <button className="text-action" type="submit">Зберегти медіа →</button>
        </form>
        <div className="inline-actions"><Link className="button button--neutral button--outline" href={`${source}?download=1`}>Завантажити</Link><form action={createEventKitItemFromMediaAction.bind(null, eventId, asset.id)}><button className="button button--neutral button--outline" type="submit">В Event Kit</button></form></div>
      </div> : null}
    </article>
  );
}
