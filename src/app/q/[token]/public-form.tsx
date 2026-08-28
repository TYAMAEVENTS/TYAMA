"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
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
  const [submissionKey, setSubmissionKey] = useState(idempotencyKey);
  const [draftStatus, setDraftStatus] = useState<"restored" | "saved" | undefined>();
  const formRef = useRef<HTMLFormElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const draftKey = `tyama:questionnaire-draft:v1:${token}`;
  const mediaFiles = useMemo<SelectedMediaFile[]>(() => Object.entries(selectedMedia).flatMap(([questionId, files]) => files.map((file) => ({ questionId, file }))), [selectedMedia]);
  const acceptedMedia = [
    questionnaire.allow_images ? "image/jpeg,image/png,image/webp" : "",
    questionnaire.allow_video ? "video/mp4,video/quicktime" : "",
    questionnaire.allow_audio ? "audio/mpeg,audio/mp4,audio/wav" : "",
  ].filter(Boolean).join(",");

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Record<string, string | string[]>;
      if (typeof draft._idempotencyKey === "string" && /^[0-9a-f-]{36}$/i.test(draft._idempotencyKey)) {
        window.requestAnimationFrame(() => setSubmissionKey(draft._idempotencyKey as string));
      }
      for (const [name, value] of Object.entries(draft)) {
        const controls = form.elements.namedItem(name);
        if (controls instanceof HTMLInputElement || controls instanceof HTMLTextAreaElement) {
          if (controls.type !== "file" && typeof value === "string") controls.value = value;
        } else if (controls instanceof HTMLSelectElement) {
          const values = Array.isArray(value) ? value : [value];
          for (const option of controls.options) option.selected = values.includes(option.value);
        }
      }
      window.requestAnimationFrame(() => setDraftStatus("restored"));
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!state.success) return;
    window.localStorage.removeItem(draftKey);
  }, [draftKey, state.success]);

  function saveDraft() {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const draft: Record<string, string | string[]> = {};
      draft._idempotencyKey = submissionKey;
      for (const element of Array.from(form.elements)) {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) continue;
        if (!element.name || element instanceof HTMLInputElement && ["file", "hidden", "submit"].includes(element.type)) continue;
        if (element instanceof HTMLSelectElement && element.multiple) draft[element.name] = Array.from(element.selectedOptions).map((option) => option.value);
        else draft[element.name] = element.value;
      }
      try {
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
        setDraftStatus("saved");
      } catch {
        // Storage may be disabled; form submission remains available.
      }
    }, 350);
  }

  function selectFiles(questionId: string, files: FileList | null) {
    const next = Array.from(files ?? []);
    const otherCount = Object.entries(selectedMedia).reduce((count, [key, current]) => key === questionId ? count : count + current.length, 0);
    const otherBytes = Object.entries(selectedMedia).reduce((bytes, [key, current]) => key === questionId ? bytes : bytes + current.reduce((sum, file) => sum + file.size, 0), 0);
    if (otherCount + next.length > 10) {
      setMediaError("До однієї анкети можна додати максимум 10 файлів.");
      return;
    }
    if (otherBytes + next.reduce((sum, file) => sum + file.size, 0) > 200 * 1024 * 1024) {
      setMediaError("Загальний розмір файлів однієї анкети не може перевищувати 200 МБ.");
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
    <form ref={formRef} action={action} className="public-form" onInput={saveDraft} onChange={saveDraft} noValidate>
      <input type="hidden" name="idempotencyKey" value={submissionKey} />
      {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
      <div className="draft-status" role="status" aria-live="polite"><strong>{draftStatus === "restored" ? "Чернетку відновлено." : draftStatus === "saved" ? "Чернетку збережено на цьому пристрої." : "Текст автоматично зберігається на цьому пристрої."}</strong><span>Файли не зберігаються — їх треба вибрати перед надсиланням.</span></div>
      <div className="public-question public-question--identity">
        <label htmlFor="displayName"><span className="public-question__index">00</span><strong>Як до вас звертатися?</strong></label>
        <input id="displayName" name="displayName" required autoComplete="name" />
      </div>
      {questionnaire.questions.map((question, index) => (
        <div className="public-question" key={question.id}>
          <label htmlFor={`answer-${question.id}`}><span className="public-question__index">{String(index + 1).padStart(2, "0")}</span><strong>{question.prompt}</strong>{question.is_required ? <em>Обов’язково</em> : null}</label>
          {question.help_text ? <p>{question.help_text}</p> : null}
          {question.type === "long_text" ? <textarea className="resize-none" id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required} /> : null}
          {question.type === "short_text" ? <input id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required} /> : null}
          {question.type === "boolean" ? <select id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required}><option value="">Оберіть</option><option value="yes">Так</option><option value="no">Ні</option></select> : null}
          {(question.type === "single_select" || question.type === "multi_select") ? <select id={`answer-${question.id}`} name={`answer:${question.id}`} required={question.is_required} multiple={question.type === "multi_select"}>{question.type === "single_select" ? <option value="">Оберіть</option> : null}{(question.settings.options ?? []).map((option) => <option value={option} key={option}>{option}</option>)}</select> : null}
          {question.type === "media" ? <input id={`answer-${question.id}`} type="file" accept={acceptedMedia} multiple onChange={(event) => selectFiles(question.id, event.currentTarget.files)} /> : null}
        </div>
      ))}
      {mediaError ? <StatusMessage tone="error">{mediaError}</StatusMessage> : null}
      <div className="public-submit"><p>Натискаючи «Надіслати», ви передаєте відповіді ведучому цієї події. Публікація можлива лише після ручної модерації.</p><Button type="submit" busy={pending}>Надіслати ведучому →</Button></div>
    </form>
  );
}
