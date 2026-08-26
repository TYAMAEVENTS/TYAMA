"use server";

import { capabilityHash } from "@/lib/questionnaires/tokens";
import { getPublicQuestionnaire } from "@/lib/questionnaires/data";
import { supabaseEdge } from "@/lib/supabase/edge";

export type PublicSubmissionState = { error?: string; success?: boolean };

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
    if (question.type === "multi_select") answers.push({ question_id: question.id, answer_json: values.slice(0, 50) });
    else if (question.type === "boolean") answers.push({ question_id: question.id, answer_json: values[0] === "yes" });
    else answers.push({ question_id: question.id, answer_text: values[0].slice(0, 10000) });
  }

  const missingRequired = questionnaire.questions.some((question) =>
    question.is_required && !answers.some((answer) => answer.question_id === question.id),
  );
  if (missingRequired) return { error: "Заповніть усі обов’язкові поля." };

  try {
    await supabaseEdge({
      action: "submit_questionnaire",
      token_hash: capabilityHash(rawToken),
      idempotency_hash: capabilityHash(`${rawToken}:${idempotencyKey}`),
      display_name: displayName,
      answers,
    });
    return { success: true };
  } catch {
    return { error: "Не вдалося надіслати відповіді. Ваш текст лишився у формі — спробуйте ще раз." };
  }
}
