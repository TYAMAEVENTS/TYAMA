"use client";

import { useActionState, useMemo, useState } from "react";
import { submitPublicQuestionnaireAction, type PublicSubmissionState } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";
import type { PublicQuestionnaire } from "@/lib/questionnaires/data";
import { PublicMediaUploader, type SelectedMediaFile } from "./public-media-uploader";

const initialState: PublicSubmissionState = {};

export function PublicQuestionnaireForm({ questionnaire, token, idempotencyKey }: { questionnaire: PublicQuestionnaire; token: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(submitPublicQuestionnaireAction.bind(null, token), initialState);
  const [selectedMedia, setSelectedMedia] = useState<Record<string, File[]>>({});
  const [mediaError, setMediaError] = useState<string>();
  const mediaFiles = useMemo<SelectedMediaFile[]>(() => Object.entries(selectedMedia).flatMap(([questionId, files]) => files.map((file) => ({ questionId, file }))), [selectedMedia]);
  const acceptedMedia = [
    questionnaire.allow_images ? "image/jpeg,image/png,image/webp" : "",
    questionnaire.allow_video ? "video/mp4,video/quicktime" : "",
    questionnaire.allow_audio ? "audio/mpeg,audio/mp4,audio/wav" : "",
  ].filter(Boolean).join(",");

  function selectFiles(questionId: string, files: FileList | null) {
    const next = Array.from(files ?? []);
    const otherCount = Object.entries(selectedMedia).reduce((count, [key, current]) => key === questionId ? count : count + current.length, 0);
    if (otherCount + next.length > 10) {
      setMediaError("До однієї анкети можна додати максимум 10 файлів.");
      return;
    }
    const invalid = next.find((file) => !acceptedMedia.split(",").includes(file.type)
      || file.size <= 0
      || file.size > 100 * 1024 * 1024
      || (file.type.startsWith("image/") && file.size > 10 * 1024 * 1024)
      || (file.type.startsWith("audio/") && file.size > 25 * 1024 * 1024));
    if (invalid) {
      setMediaError(`Файл «${invalid.name}» має непідтримуваний формат або розмір.`);
      return;
    }
    setMediaError(undefined);
    setSelectedMedia((current) => ({ ...current, [questionId]: next }));
  }

  if (state.success) {
    return mediaFiles.length ? <PublicMediaUploader token={token} idempotencyKey={idempotencyKey} files={mediaFiles} /> : <section className="public-success"><span className="public-success__mark">✓</span><h2>Збіглося.</h2><p>Відповіді вже у Свята. Їх ніхто не побачить публічно без його перевірки.</p></section>;
  }
  return (
    <form action={action} className="public-form">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
      <div className="public-question public-question--identity">
        <label htmlFor="displayName"><span className="public-question__index">00</span><strong>Як до вас звертатися?</strong></label>
        <input id="displayName" name="displayName" required autoComplete="name" />
      </div>
      {questionnaire.questions.map((question, index) => (
        <div className="public-question" key={question.id}>
          <label htmlFor={`answer-${question.id}`}><span className="public-question__index">{String(index + 1).padStart(2, "0")}</span><strong>{question.prompt}</strong>{question.is_required ? <em>Обов’язково</em> : null}</label>
          {question.help_text ? <p>{question.help_text}</p> : null}
          {question.type === "long_text" ? <textarea id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required} /> : null}
          {question.type === "short_text" ? <input id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required} /> : null}
          {question.type === "boolean" ? <select id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required}><option value="">Оберіть</option><option value="yes">Так</option><option value="no">Ні</option></select> : null}
          {(question.type === "single_select" || question.type === "multi_select") ? <select id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required} multiple={question.type === "multi_select"}>{question.type === "single_select" ? <option value="">Оберіть</option> : null}{(question.settings.options ?? []).map((option) => <option value={option} key={option}>{option}</option>)}</select> : null}
          {question.type === "media" ? <input id={`answer-${question.id}`} type="file" accept={acceptedMedia} multiple onChange={(event) => selectFiles(question.id, event.currentTarget.files)} /> : null}
        </div>
      ))}
      {mediaError ? <StatusMessage tone="error">{mediaError}</StatusMessage> : null}
      <div className="public-submit"><p>Натискаючи «Надіслати», ви передаєте відповіді ведучому цієї події. Публікація можлива лише після ручної модерації.</p><Button type="submit" busy={pending}>Надіслати Святу →</Button></div>
    </form>
  );
}
