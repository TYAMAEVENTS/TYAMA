import type { EventKitType } from "@/lib/event-kit/types";
import type { EventSubmission } from "@/lib/responses/data";

export type SmartEventKitDraft = {
  generatorKey: string;
  itemType: EventKitType;
  title: string;
  content: string;
  sourceRefs: Array<{ type: "answer"; id: string }>;
  data: Record<string, unknown>;
};

type UsableAnswer = {
  id: string;
  prompt: string;
  value: string;
  respondent: string;
};

const STORY_PROMPT = /істор|спогад|момент|сміш|кумед|познайом|пригад|випадок/i;
const NON_SURVEY_PROMPT = /як вас звати|ваше ім['’]?я|email|e-mail|телефон|контакт|ким ви довод|ваша роль|дата народження/i;

function answerValue(answer: EventSubmission["answers"][number]) {
  if (answer.answer_text?.trim()) return answer.answer_text.trim();
  if (answer.answer_json === null || answer.answer_json === undefined) return "";
  if (typeof answer.answer_json === "string") return answer.answer_json.trim();
  return JSON.stringify(answer.answer_json);
}

function collectAnswers(submissions: EventSubmission[]): UsableAnswer[] {
  return submissions.flatMap((submission) => submission.answers.flatMap((answer) => {
    const value = answerValue(answer);
    if (!value || answer.do_not_use || answer.moderation_status === "rejected" || answer.question?.type === "media") return [];
    return [{
      id: answer.id,
      prompt: answer.question?.prompt || "Відповідь з анкети",
      value,
      respondent: submission.respondent?.display_name || "Без імені",
    }];
  }));
}

function clip(value: string, length = 700) {
  return value.length > length ? `${value.slice(0, length - 1).trim()}…` : value;
}

export function buildSmartEventKitDrafts(submissions: EventSubmission[]): SmartEventKitDraft[] {
  const answers = collectAnswers(submissions);
  if (!answers.length) return [];

  const drafts: SmartEventKitDraft[] = [];
  const context = answers.filter((answer) => !STORY_PROMPT.test(answer.prompt)).slice(0, 6);
  if (context.length) {
    drafts.push({
      generatorKey: "smart-context-v1",
      itemType: "fact",
      title: "Контекст події — головне перед виходом",
      content: context.map((answer) => `• ${answer.prompt}\n${clip(answer.value, 360)}`).join("\n\n"),
      sourceRefs: context.map((answer) => ({ type: "answer", id: answer.id })),
      data: { generator: "smart_draft_v1", block: "context" },
    });
  }

  const stories = answers.filter((answer) => STORY_PROMPT.test(answer.prompt) || answer.value.length >= 120).slice(0, 4);
  for (const story of stories) {
    drafts.push({
      generatorKey: `smart-story-v1:${story.id}`,
      itemType: "story",
      title: `Історія від ${story.respondent}`,
      content: `${story.prompt}\n\n${clip(story.value, 1200)}\n\nШпаргалка: уточніть деталі й фінальну репліку перед використанням наживо.`,
      sourceRefs: [{ type: "answer", id: story.id }],
      data: { generator: "smart_draft_v1", block: "story" },
    });
  }

  const grouped = new Map<string, UsableAnswer[]>();
  for (const answer of answers) grouped.set(answer.prompt, [...(grouped.get(answer.prompt) ?? []), answer]);
  const survey = [...grouped.entries()]
    .filter(([prompt, values]) => values.length >= 2 && !NON_SURVEY_PROMPT.test(prompt) && !STORY_PROMPT.test(prompt))
    .sort((a, b) => b[1].length - a[1].length)[0];
  if (survey) {
    const [prompt, values] = survey;
    drafts.push({
      generatorKey: `smart-100-v1:${prompt}`,
      itemType: "interactive",
      title: "100 зі 100 — робоча чернетка",
      content: [
        `Питання: ${prompt}`,
        `Фактично зібрано відповідей: ${values.length}. Не вигадуйте бали — згрупуйте схожі формулювання перед грою.`,
        "",
        ...values.slice(0, 12).map((answer) => `• ${answer.respondent}: ${clip(answer.value, 220)}`),
        "",
        "Механіка: дві команди називають найпопулярніші відповіді; ведучий відкриває підготовлені позиції по черзі.",
      ].join("\n"),
      sourceRefs: values.map((answer) => ({ type: "answer", id: answer.id })),
      data: { generator: "smart_draft_v1", block: "interactive_100", response_count: values.length },
    });
  } else {
    drafts.push({
      generatorKey: "smart-100-setup-v2",
      itemType: "interactive",
      title: "100 зі 100 — підготовка збору",
      content: [
        "У поточних відповідях ще немає придатного спільного питання з достатньою вибіркою.",
        "",
        "Перед грою додайте в guest-анкету одне коротке питання, наприклад:",
        "• Яке слово найкраще описує цю пару?",
        "• Що вони найімовірніше зроблять у спільну вільну суботу?",
        "• Без чого неможливо уявити їхнє спільне життя?",
        "",
        "Після відповідей згрупуйте однакові формулювання й призначте бали лише за фактичну частоту. TYAMA не вигадує результати.",
      ].join("\n"),
      sourceRefs: [],
      data: { generator: "smart_draft_v1", block: "interactive_100_setup", response_count: 0 },
    });
  }

  drafts.push({
    generatorKey: "smart-host-cheatsheet-v1",
    itemType: "warning",
    title: "Шпаргалка ведучого — контроль перед Live",
    content: [
      "1. Перевірити імена, наголоси та приватні теми.",
      "2. Схвалити лише потрібні блоки; для екрана окремо встановити public_allowed.",
      "3. Пройти Rehearsal і перевірити Public Screen на окремому пристрої.",
      "4. Завантажити CSV, JSON, printable Event Kit і потрібні медіа до виїзду.",
      "5. Якщо зв’язок зник — продовжити з локального backup; останній Public Screen state збережеться.",
    ].join("\n"),
    sourceRefs: [],
    data: { generator: "smart_draft_v1", block: "host_cheatsheet" },
  });

  return drafts;
}
