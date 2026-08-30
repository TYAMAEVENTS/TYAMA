"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";

export type SelectedMediaFile = { questionId: string; file: File };
type UploadState = "queued" | "uploading" | "ready" | "error";

type PreparedUpload = {
  asset_id: string;
  upload_url: string;
};

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error("Request failed");
  return await response.json() as T;
}

export function PublicMediaUploader({
  token,
  idempotencyKey,
  files,
  draftCapability,
  sourceSetHash,
  consentVersion,
  consent,
}: {
  token: string;
  idempotencyKey: string;
  files: SelectedMediaFile[];
  draftCapability: string;
  sourceSetHash: string;
  consentVersion: string;
  consent: boolean;
}) {
  const [states, setStates] = useState<UploadState[]>(() => files.map(() => "queued"));
  const [busy, setBusy] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const preparedUploads = useRef<Array<PreparedUpload | undefined>>([]);
  const uploadedFiles = useRef<boolean[]>([]);
  const readyCount = states.filter((state) => state === "ready").length;
  const errorCount = states.filter((state) => state === "error").length;

  async function uploadAll() {
    setBusy(true);
    const nextStates = [...states];
    for (let index = 0; index < files.length; index += 1) {
      if (nextStates[index] === "ready") continue;
      nextStates[index] = "uploading";
      setStates([...nextStates]);
      const selected = files[index];
      try {
        let prepared = preparedUploads.current[index];
        if (!prepared) {
          const preparedResponse = await fetch("/api/public-media/prepare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              idempotencyKey,
              questionId: selected.questionId,
              filename: selected.file.name,
              mimeType: selected.file.type,
              sizeBytes: selected.file.size,
            }),
          });
          prepared = await responseJson<PreparedUpload>(preparedResponse);
          preparedUploads.current[index] = prepared;
        }
        if (!uploadedFiles.current[index]) {
          const uploadBody = new FormData();
          uploadBody.append("cacheControl", "3600");
          uploadBody.append("", selected.file);
          const uploadResponse = await fetch(prepared.upload_url, {
            method: "PUT",
            headers: { "x-upsert": "false" },
            body: uploadBody,
          });
          if (!uploadResponse.ok) {
            throw new Error("Upload failed");
          }
          uploadedFiles.current[index] = true;
        }
        await responseJson(await fetch("/api/public-media/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, idempotencyKey, assetId: prepared.asset_id }),
        }));
        nextStates[index] = "ready";
      } catch {
        nextStates[index] = "error";
      }
      setStates([...nextStates]);
    }
    if (nextStates.every((state) => state === "ready")) {
      await responseJson(await fetch("/api/public-submission/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftCapability, sourceSetHash, consentVersion, consent }) }));
      setFinalized(true);
    }
    setBusy(false);
  }

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void uploadAll();
  // The upload bundle is intentionally started once after the single submit action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (finalized && readyCount === files.length) {
    return <StatusMessage tone="success">Відповіді й усі файли надіслано ведучому.</StatusMessage>;
  }

  return (
    <section className="public-media-upload" aria-labelledby="media-upload-title">
      <span className="eyebrow">НАДСИЛАННЯ</span>
      <h2 id="media-upload-title">Завантажуємо вибрані файли…</h2>
      <p>Це частина одного надсилання. Не закривайте сторінку до фінального підтвердження.</p>
      {errorCount ? <StatusMessage tone="error">{errorCount} файл(и) не завантажились. Натисніть кнопку ще раз — готові файли не дублюються.</StatusMessage> : null}
      <ul className="public-media-list">
        {files.map((selected, index) => (
          <li key={`${selected.questionId}:${selected.file.name}:${selected.file.size}`}>
            <span>{selected.file.name}</span>
            <strong>{states[index] === "queued" ? "готовий" : states[index] === "uploading" ? "завантаження…" : states[index] === "ready" ? "✓ збережено" : "спробуйте ще"}</strong>
          </li>
        ))}
      </ul>
      {errorCount ? <Button type="button" busy={busy} onClick={uploadAll}>Повторити невдалі файли →</Button> : null}
    </section>
  );
}
