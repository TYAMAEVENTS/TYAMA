"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { supabaseRest } from "@/lib/supabase/rest";
import { capabilityHash, questionnaireToken } from "@/lib/questionnaires/tokens";
import {
  QUESTIONNAIRE_AUDIENCES,
  QUESTION_TYPES,
  type Questionnaire,
  type QuestionnaireAudience,
  type Question,
  type QuestionType,
} from "@/lib/questionnaires/types";

const STARTERS: Record<"customer" | "guest", Array<Pick<Question, "type" | "prompt" | "help_text" | "is_required" | "default_privacy">>> = {
  customer: [
    { type: "short_text", prompt: "Як до вас обох звертатися?", help_text: "Імена та бажана форма звертання.", is_required: true, default_privacy: "host_only" },
    { type: "long_text", prompt: "Опишіть вашу подію трьома словами.", help_text: "Не шукайте правильних слів — важливе ваше відчуття.", is_required: true, default_privacy: "review_required" },
    { type: "long_text", prompt: "Що гості мають відчути наприкінці вечора?", help_text: null, is_required: true, default_privacy: "review_required" },
    { type: "long_text", prompt: "Як ви познайомилися?", help_text: "Де, коли і що кожен із вас запам’ятав.", is_required: true, default_privacy: "review_required" },
    { type: "long_text", prompt: "Яке було перше враження одне про одного?", help_text: "Можна відповісти окремо від кожного.", is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Коли ви зрозуміли, що це серйозно?", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Розкажіть історію освідчення або рішення одружитися.", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Які риси партнера ви найбільше цінуєте?", help_text: "По кілька рис від кожного.", is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Які ваші смішні, милі або дуже впізнавані звички?", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Через що ви можете жартома сперечатися?", help_text: "Тільки те, що точно комфортно згадувати публічно.", is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Які спільні мрії, плани або пригоди вас об’єднують?", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Хто з гостей особливо важливий і чому?", help_text: "Імена, роль у вашому житті та короткий контекст.", is_required: true, default_privacy: "host_only" },
    { type: "long_text", prompt: "Які сімейні історії або традиції варто згадати?", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Які люди, історії або моменти точно мають прозвучати?", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Що на вашій події точно не повинно бути шаблонним?", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Які інтерактиви вам подобаються, а які — ні?", help_text: "Наприклад: командні, музичні, з історіями, без виходу на сцену.", is_required: false, default_privacy: "host_only" },
    { type: "long_text", prompt: "Яка музика, фільми, меми або культурні штуки — точно про вас?", help_text: "Це допоможе знайти ваш тон і референси.", is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Які фото, відео або аудіо варто попросити у гостей?", help_text: "Самі файли додамо після окремої перевірки media-flow.", is_required: false, default_privacy: "host_only" },
    { type: "long_text", prompt: "Чи готуються сюрпризи, про які має знати ведучий?", help_text: "Цю відповідь бачить лише ведучий.", is_required: false, default_privacy: "host_only" },
    { type: "long_text", prompt: "Яких тем, жартів, людей або згадок потрібно уникати?", help_text: "Цю відповідь бачить лише ведучий і вона ніколи не піде на екран автоматично.", is_required: true, default_privacy: "host_only" },
    { type: "long_text", prompt: "Чи є складні стосунки, втрати або чутливі обставини, які ведучий має врахувати?", help_text: "Можна написати лише стільки, скільки вам комфортно.", is_required: false, default_privacy: "host_only" },
    { type: "short_text", prompt: "Чиї імена або прізвища важливо правильно вимовити?", help_text: "За потреби додайте наголос у слові.", is_required: false, default_privacy: "host_only" },
    { type: "long_text", prompt: "Що ще Свят має зрозуміти про вас до першої зустрічі?", help_text: "Будь-який контекст, для якого не знайшлося окремого питання.", is_required: false, default_privacy: "host_only" },
  ],
  guest: [
    { type: "short_text", prompt: "Як вас звати?", help_text: null, is_required: true, default_privacy: "host_only" },
    { type: "short_text", prompt: "Ким ви доводитесь героям події?", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Розкажіть історію, яку варто згадати на святі.", help_text: "Без хвилювань: спочатку все перегляне ведучий.", is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Що про героїв події знаєте тільки ви?", help_text: null, is_required: false, default_privacy: "review_required" },
  ],
};

export type QuestionnaireActionState = { error?: string; questionnaireId?: string };

function pathFor(eventId: string, questionnaireId?: string) {
  return questionnaireId
    ? `/events/${eventId}/questionnaires/${questionnaireId}`
    : `/events/${eventId}/questionnaires`;
}

async function hostContext(eventId: string) {
  const user = await requireUser();
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");
  const event = await getEvent(eventId);
  if (!event || event.host_id !== user.id) throw new Error("Event not found");
  return { user, accessToken };
}

export async function createQuestionnaireAction(
  eventId: string,
  _: QuestionnaireActionState,
  formData: FormData,
): Promise<QuestionnaireActionState> {
  const { user, accessToken } = await hostContext(eventId);
  const audienceValue = String(formData.get("audience") ?? "guest");
  const audience = QUESTIONNAIRE_AUDIENCES.includes(audienceValue as QuestionnaireAudience)
    ? (audienceValue as QuestionnaireAudience)
    : "guest";
  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  if (!title) return { error: "Додайте назву анкети." };

  try {
    const rows = await supabaseRest<Questionnaire[]>("questionnaires", {
      method: "POST",
      accessToken,
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ host_id: user.id, event_id: eventId, audience, title, status: "draft" }),
    });
    const questionnaire = rows[0];
    if (!questionnaire) return { error: "Анкету не створено. Спробуйте ще раз." };

    const token = questionnaireToken(questionnaire.id);
    await supabaseRest(`questionnaires?id=eq.${questionnaire.id}&event_id=eq.${eventId}`, {
      method: "PATCH",
      accessToken,
      body: JSON.stringify({ public_token_hash: capabilityHash(token) }),
    });

    const starterKey = audience === "guest" || audience === "other" ? "guest" : "customer";
    const questions = STARTERS[starterKey].map((question, index) => ({
      ...question,
      host_id: user.id,
      event_id: eventId,
      questionnaire_id: questionnaire.id,
      sort_order: (index + 1) * 10,
    }));
    await supabaseRest("questions", { method: "POST", accessToken, body: JSON.stringify(questions) });
    return { questionnaireId: questionnaire.id };
  } catch {
    return { error: "Анкету не створено. Введені дані лишилися у формі — спробуйте ще раз." };
  }
}

export async function updateQuestionnaireAction(eventId: string, questionnaireId: string, formData: FormData) {
  const { accessToken } = await hostContext(eventId);
  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  const description = String(formData.get("description") ?? "").trim().slice(0, 2000);
  if (!title) redirect(`${pathFor(eventId, questionnaireId)}?error=title`);
  await supabaseRest(`questionnaires?id=eq.${questionnaireId}&event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ title, description: description || null }),
  });
  revalidatePath(pathFor(eventId, questionnaireId));
}

export async function setQuestionnaireStatusAction(eventId: string, questionnaireId: string, status: "published" | "closed" | "draft") {
  const { accessToken } = await hostContext(eventId);
  if (status === "published") {
    const active = await supabaseRest<Question[]>(
      `questions?select=id&questionnaire_id=eq.${questionnaireId}&event_id=eq.${eventId}&is_active=eq.true&limit=1`,
      { accessToken },
    );
    if (!active.length) redirect(`${pathFor(eventId, questionnaireId)}?error=no-active-questions`);
  }
  await supabaseRest(`questionnaires?id=eq.${questionnaireId}&event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ status, public_token_hash: capabilityHash(questionnaireToken(questionnaireId)) }),
  });
  revalidatePath(pathFor(eventId, questionnaireId));
  revalidatePath(pathFor(eventId));
}

export async function addQuestionAction(eventId: string, questionnaireId: string, formData: FormData) {
  const { user, accessToken } = await hostContext(eventId);
  const typeValue = String(formData.get("type") ?? "short_text");
  const type = QUESTION_TYPES.includes(typeValue as QuestionType) ? (typeValue as QuestionType) : "short_text";
  const prompt = String(formData.get("prompt") ?? "").trim().slice(0, 1000);
  if (!prompt) redirect(`${pathFor(eventId, questionnaireId)}?error=question-prompt`);
  const current = await supabaseRest<Array<Pick<Question, "sort_order">>>(
    `questions?select=sort_order&questionnaire_id=eq.${questionnaireId}&event_id=eq.${eventId}&order=sort_order.desc&limit=1`,
    { accessToken },
  );
  await supabaseRest("questions", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      host_id: user.id,
      event_id: eventId,
      questionnaire_id: questionnaireId,
      type,
      prompt,
      is_required: formData.get("isRequired") === "on",
      sort_order: (current[0]?.sort_order ?? 0) + 10,
      default_privacy: "review_required",
    }),
  });
  revalidatePath(pathFor(eventId, questionnaireId));
}

export async function updateQuestionAction(eventId: string, questionnaireId: string, questionId: string, formData: FormData) {
  const { accessToken } = await hostContext(eventId);
  const prompt = String(formData.get("prompt") ?? "").trim().slice(0, 1000);
  if (!prompt) redirect(`${pathFor(eventId, questionnaireId)}?error=question-prompt`);
  await supabaseRest(`questions?id=eq.${questionId}&questionnaire_id=eq.${questionnaireId}&event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({
      prompt,
      help_text: String(formData.get("helpText") ?? "").trim().slice(0, 500) || null,
      is_required: formData.get("isRequired") === "on",
      is_active: formData.get("isActive") === "on",
      default_privacy: String(formData.get("privacy") ?? "review_required"),
    }),
  });
  revalidatePath(pathFor(eventId, questionnaireId));
}

export async function moveQuestionAction(eventId: string, questionnaireId: string, questionId: string, direction: "up" | "down") {
  const { accessToken } = await hostContext(eventId);
  const questions = await supabaseRest<Array<Pick<Question, "id" | "sort_order">>>(
    `questions?select=id,sort_order&questionnaire_id=eq.${questionnaireId}&event_id=eq.${eventId}&order=sort_order.asc,created_at.asc`,
    { accessToken },
  );
  const index = questions.findIndex((question) => question.id === questionId);
  const otherIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || otherIndex < 0 || otherIndex >= questions.length) return;
  const current = questions[index];
  const other = questions[otherIndex];
  await Promise.all([
    supabaseRest(`questions?id=eq.${current.id}&event_id=eq.${eventId}`, { method: "PATCH", accessToken, body: JSON.stringify({ sort_order: other.sort_order }) }),
    supabaseRest(`questions?id=eq.${other.id}&event_id=eq.${eventId}`, { method: "PATCH", accessToken, body: JSON.stringify({ sort_order: current.sort_order }) }),
  ]);
  revalidatePath(pathFor(eventId, questionnaireId));
}
