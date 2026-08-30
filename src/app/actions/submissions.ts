"use server";

import { capabilityHash } from "@/lib/questionnaires/tokens";
import { getPublicQuestionnaire } from "@/lib/questionnaires/data";
import { supabaseEdge } from "@/lib/supabase/edge";

export type PublicSubmissionState = { error?: string; success?: boolean; draftReady?: boolean; submissionId?: string; draftCapability?: string; sourceSetHash?: string; consentVersion?: string };

export async function submitPublicQuestionnaireAction(rawToken: string, _: PublicSubmissionState, formData: FormData): Promise<PublicSubmissionState> {
  const questionnaire = await getPublicQuestionnaire(rawToken);
  if (!questionnaire) return { error: "Ця анкета недоступна або вже закрита." };
  const displayName = String(formData.get("displayName") ?? "").trim().slice(0, 160);
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");
  if (!displayName) return { error: "Напишіть, як до вас звертатися." };
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) return { error: "Оновіть сторінку та спробуйте ще раз." };

  const answers: Array<{ question_id: string; answer_text?: string; answer_json?: string[] | boolean }> = [];
  for (const question of questionnaire.questions) {
    const values = formData.getAll(`answer:${question.id}`).map(String).map((value) => value.trim()).filter(Boolean);
    if (values.length === 0) continue;
    if (question.type === "multi_select") answers.push({ question_id: question.id, answer_json: values.slice(0, 20) });
    else if (question.type === "boolean") answers.push({ question_id: question.id, answer_json: values[0] === "yes" });
    else answers.push({ question_id: question.id, answer_text: values[0].slice(0, 10000) });
  }

  const missingRequired = questionnaire.questions.some((question) =>
    question.is_required && !answers.some((answer) => answer.question_id === question.id),
  );
  if (missingRequired) return { error: "Заповніть усі обов’язкові поля." };

  try {
    const draftCapability = capabilityHash(`${rawToken}:${idempotencyKey}:draft`);
    const idempotencyHash = capabilityHash(`${rawToken}:${idempotencyKey}`);
    const draft = await supabaseEdge<{ submission_id: string }>({
      action: "begin_submission_draft",
      token_hash: capabilityHash(rawToken),
      idempotency_hash: idempotencyHash,
      draft_capability_hash: draftCapability,
      display_name: displayName,
    });
    await supabaseEdge({
      action: "save_submission_draft",
      draft_capability_hash: draftCapability,
      answers,
    });
    const consent = formData.get("publicUseConsent") === "on";
    const hasMedia = questionnaire.questions.some((question) => question.type === "media" && formData.get(`hasMedia:${question.id}`) === "true");
    if (hasMedia) return { draftReady: true, submissionId: draft.submission_id, draftCapability, sourceSetHash: questionnaire.source_set_hash, consentVersion: "pack2-consent-v1" };
    const result = await supabaseEdge<{ submission_id: string }>({ action: "finalize_submission_draft", draft_capability_hash: draftCapability, source_set_hash: questionnaire.source_set_hash, consent_version: "pack2-consent-v1", consent });
    return { success: true, submissionId: result.submission_id };
  } catch {
    return { error: "Не вдалося надіслати відповіді. Ваш текст лишився у формі — спробуйте ще раз." };
  }
}
