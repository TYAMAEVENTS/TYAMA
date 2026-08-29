"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { getEvent } from "@/lib/events/data";
import { listEventSubmissions } from "@/lib/responses/data";
import { supabaseRest } from "@/lib/supabase/rest";
import { capabilityHash, questionnaireToken } from "@/lib/questionnaires/tokens";
import {
  QUESTIONNAIRE_AUDIENCES,
  QUESTION_TYPES,
  type QuestionnaireAudience,
  type Question,
  type QuestionType,
} from "@/lib/questionnaires/types";

type StarterQuestion = Pick<Question, "type" | "prompt" | "help_text" | "is_required" | "default_privacy"> & Pick<Partial<Question>, "settings">;

const STARTERS: Record<"customer" | "guest", StarterQuestion[]> = {
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
    { type: "short_text", prompt: "Ким ви доводитесь героям події та як давно ви знайомі?", help_text: null, is_required: true, default_privacy: "review_required" },
    { type: "long_text", prompt: "Якими трьома словами ви б описали героїв події?", help_text: "Можна серйозно, смішно або дуже по-вашому.", is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Як ви познайомилися або який ваш перший спільний спогад?", help_text: null, is_required: false, default_privacy: "review_required", settings: { content_intents: ["story"] } },
    { type: "long_text", prompt: "Розкажіть історію, яку варто згадати на святі.", help_text: "Додайте деталі й фінал. Спочатку все перегляне ведучий.", is_required: false, default_privacy: "review_required", settings: { content_intents: ["story", "who_said"], who_said_priority: 50 } },
    { type: "long_text", prompt: "Яка їхня звичка, фраза або риса одразу видає їх серед інших?", help_text: null, is_required: false, default_privacy: "review_required", settings: { content_intents: ["family_feud", "who_said"], who_said_priority: 30 } },
    { type: "long_text", prompt: "Який талант, суперсила або неочевидна навичка у них є?", help_text: null, is_required: false, default_privacy: "review_required", settings: { content_intents: ["family_feud"] } },
    { type: "long_text", prompt: "Що про героїв події знаєте тільки ви?", help_text: "Не пишіть те, що може образити або нашкодити.", is_required: false, default_privacy: "host_only" },
    { type: "long_text", prompt: "Який момент із ними ви хотіли б пережити ще раз?", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Яка пісня, фільм, мем або фраза у вас із ними асоціюється?", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Що вони найімовірніше зроблять у спільний вільний день?", help_text: "Це питання може стати основою для «100 зі 100».", is_required: false, default_privacy: "review_required", settings: { content_intents: ["family_feud"] } },
    { type: "long_text", prompt: "Яке слово найкраще описує їх разом і чому?", help_text: "Це питання може стати основою для «100 зі 100».", is_required: false, default_privacy: "review_required", settings: { content_intents: ["family_feud", "who_said"], who_said_priority: 20 } },
    { type: "long_text", prompt: "Яке побажання, прогноз або дружню пораду ви хочете залишити?", help_text: null, is_required: false, default_privacy: "review_required" },
    { type: "long_text", prompt: "Чого ведучому точно не варто згадувати або показувати публічно?", help_text: "Цю відповідь бачить лише ведучий.", is_required: false, default_privacy: "host_only" },
    { type: "media", prompt: "Додайте фото, відео або аудіо для героїв події", help_text: "До 10 файлів. Усе спочатку побачить і перевірить ведучий.", is_required: false, default_privacy: "review_required", settings: { content_intents: ["media"] } },
  ],
};

function contextualGuestQuestions(signal: string) {
  const value = signal.toLowerCase();
  const questions: typeof STARTERS.guest = [];
  if (/подорож|мандр|країн|міст|пригод/.test(value)) questions.push({ type: "long_text", prompt: "Яка спільна подорож або пригода найкраще їх характеризує?", help_text: null, is_required: false, default_privacy: "review_required" });
  if (/родин|сімейн|традиц|батьк|мам|дід|баб/.test(value)) questions.push({ type: "long_text", prompt: "Яка родинна історія або традиція пов’язує вас із героями події?", help_text: null, is_required: false, default_privacy: "review_required" });
  if (/музик|пісн|танц|концерт/.test(value)) questions.push({ type: "long_text", prompt: "Яка музична історія, пісня або танець точно про них?", help_text: null, is_required: false, default_privacy: "review_required" });
  if (/робот|професі|університет|школ|навчан/.test(value)) questions.push({ type: "long_text", prompt: "Яка історія з роботи або навчання показує їх справжніми?", help_text: null, is_required: false, default_privacy: "review_required" });
  return questions.slice(0, 3);
}

function whoSaidQuestion(eventType: string): StarterQuestion {
  const subject = eventType === "wedding"
    ? "наречених"
    : eventType === "birthday"
      ? "іменинника або іменинницю"
      : eventType === "corporate"
        ? "вашу команду або героя події"
        : "героїв події";
  return {
    type: "long_text" as const,
    prompt: `Опишіть ${subject} однією фразою.`,
    help_text: "Ця фраза може потрапити у гру «Хто це сказав?». Ведучий не показуватиме її як звичайну відповідь.",
    is_required: false,
    default_privacy: "review_required" as const,
    settings: { content_intents: ["who_said"], who_said_priority: 10, who_said_role: "quote" },
  };
}

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
  return { user, accessToken, event };
}

export async function createQuestionnaireAction(
  eventId: string,
  _: QuestionnaireActionState,
  formData: FormData,
): Promise<QuestionnaireActionState> {
  const { accessToken, event } = await hostContext(eventId);
  const audienceValue = String(formData.get("audience") ?? "guest");
  const audience = QUESTIONNAIRE_AUDIENCES.includes(audienceValue as QuestionnaireAudience)
    ? (audienceValue as QuestionnaireAudience)
    : "guest";
  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  if (!title) return { error: "Додайте назву анкети." };

  try {
    const starterKey = audience === "guest" || audience === "other" ? "guest" : "customer";
    const buildMode = String(formData.get("guestBuildMode") ?? "host_brief");
    const hostBrief = String(formData.get("hostBrief") ?? "").trim().slice(0, 4000);
    let starter = STARTERS[starterKey];
    let sourceDescription: string | null = null;
    if (starterKey === "guest") {
      let signal = `${event.title} ${event.client_name ?? ""} ${event.event_type} ${hostBrief}`;
      if (buildMode === "customer_context") {
        const submissions = await listEventSubmissions(eventId);
        const customerSubmissions = submissions.filter((submission) =>
          submission.questionnaire && ["customer", "couple", "bride", "groom"].includes(submission.questionnaire.audience),
        );
        signal += " " + customerSubmissions.flatMap((submission) => submission.answers.flatMap((answer) => [answer.question?.prompt ?? "", answer.answer_text ?? ""])).join(" ");
        sourceDescription = customerSubmissions.length
          ? "Guest-анкета зібрана з базової структури та сигналів із відповідей замовників. Перед публікацією перевірте формулювання й приватність."
          : "Відповідей замовників ще немає, тому використано повну базову guest-структуру та дані події. Додайте деталі ведучого перед публікацією."
      } else {
        sourceDescription = hostBrief
          ? "Guest-анкета сформована з приватного брифу ведучого та даних події. Бриф не публікується; перевірте питання перед публікацією."
          : "Повна базова guest-анкета сформована з даних події. Додайте або змініть питання перед публікацією.";
      }
      const mediaQuestion = STARTERS.guest.find((question) => question.type === "media");
      const textQuestions = STARTERS.guest.filter((question) => question.type !== "media");
      starter = [
        ...textQuestions,
        whoSaidQuestion(event.event_type),
        ...contextualGuestQuestions(signal),
        ...(mediaQuestion ? [mediaQuestion] : []),
      ];
    }
    const questions = starter.map((question, index) => ({
      ...question,
      sort_order: (index + 1) * 10,
    }));
    const questionnaireId = crypto.randomUUID();
    const createdQuestionnaireId = await supabaseRest<string>("rpc/create_questionnaire_with_questions_tx", {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        p_questionnaire_id: questionnaireId,
        p_event_id: eventId,
        p_audience: audience,
        p_title: title,
        p_public_token_hash: capabilityHash(questionnaireToken(questionnaireId)),
        p_questions: questions,
      }),
    });
    if (createdQuestionnaireId !== questionnaireId) return { error: "Анкету не створено. Спробуйте ще раз." };
    if (sourceDescription) {
      await supabaseRest(`questionnaires?id=eq.${questionnaireId}&event_id=eq.${eventId}`, {
        method: "PATCH",
        accessToken,
        body: JSON.stringify({
          description: sourceDescription.slice(0, 2000),
          ...(starterKey === "guest" ? { allow_images: true, allow_video: true, allow_audio: true } : {}),
        }),
      });
    }
    return { questionnaireId: createdQuestionnaireId };
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
    body: JSON.stringify({
      title,
      description: description || null,
      allow_images: formData.get("allowImages") === "on",
      allow_video: formData.get("allowVideo") === "on",
      allow_audio: formData.get("allowAudio") === "on",
    }),
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

export type AddQuestionState = { success?: boolean; error?: string };

export async function addQuestionAction(eventId: string, questionnaireId: string, _state: AddQuestionState, formData: FormData): Promise<AddQuestionState> {
  const { user, accessToken } = await hostContext(eventId);
  const typeValue = String(formData.get("type") ?? "short_text");
  const type = QUESTION_TYPES.includes(typeValue as QuestionType) ? (typeValue as QuestionType) : "short_text";
  const prompt = String(formData.get("prompt") ?? "").trim().slice(0, 1000);
  if (!prompt) return { error: "Додайте текст питання." };
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
      is_required: type !== "media" && formData.get("isRequired") === "on",
      sort_order: (current[0]?.sort_order ?? 0) + 10,
      default_privacy: "review_required",
    }),
  });
  return { success: true };
}

export async function updateQuestionAction(eventId: string, questionnaireId: string, questionId: string, formData: FormData) {
  const { accessToken } = await hostContext(eventId);
  const prompt = String(formData.get("prompt") ?? "").trim().slice(0, 1000);
  const type = String(formData.get("type") ?? "short_text");
  if (!prompt) redirect(`${pathFor(eventId, questionnaireId)}?error=question-prompt`);
  await supabaseRest(`questions?id=eq.${questionId}&questionnaire_id=eq.${questionnaireId}&event_id=eq.${eventId}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({
      prompt,
      help_text: String(formData.get("helpText") ?? "").trim().slice(0, 500) || null,
      is_required: type !== "media" && formData.get("isRequired") === "on",
      is_active: formData.get("isActive") === "on",
      default_privacy: String(formData.get("privacy") ?? "review_required"),
    }),
  });
  revalidatePath(pathFor(eventId, questionnaireId));
}

export async function moveQuestionAction(eventId: string, questionnaireId: string, questionId: string, direction: "up" | "down") {
  const { accessToken } = await hostContext(eventId);
  await supabaseRest<boolean>("rpc/move_question_tx", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      p_event_id: eventId,
      p_questionnaire_id: questionnaireId,
      p_question_id: questionId,
      p_direction: direction,
    }),
  });
  revalidatePath(pathFor(eventId, questionnaireId));
}
