import type { EventSubmission } from "@/lib/responses/data";
import type { ContentIntent, QuestionContentSettings } from "@/lib/questionnaires/content-intents";

export const FAMILY_FEUD_MIN_USABLE_ANSWERS = 4;
export const FAMILY_FEUD_MIN_GROUPS = 4;
export const FAMILY_FEUD_TOP_SIZE = 6;

const MEANINGLESS = new Set(["не знаю", "не знаю що сказати", "хз", "нема", "нічого", "без відповіді"]);
const OBVIOUS_UNSAFE = /(?:^|\s)(хуй|пизд|блят|їбат|єбат|довбойоб|дебіл|ідіот|лох|сука|курва)[\p{L}\p{N}_]*/iu;
const STORY_PROMPT = /істор|спогад|момент|познайом|пригад|випадок|розкаж|опишіть ситуац/i;
const NON_SURVEY_PROMPT = /як вас звати|ваше ім['’]?я|email|e-mail|телефон|контакт|ким ви довод|ваша роль|дата народження|надішліть|завантаж/i;
const WHO_SAID_PROMPT = /опишіть.+одн(ією|ою) фраз|трьома словами|яке слово найкраще описує/i;

const SAFE_ALIASES = new Map<string, string>([
  ["спізнюється", "запізнюється"],
  ["завжди спізнюється", "запізнюється"],
  ["завжди запізнюється", "запізнюється"],
  ["приходить із запізненням", "запізнюється"],
  ["допомагає всім", "допомагає"],
  ["завжди допомагає", "допомагає"],
  ["усіх смішить", "смішить усіх"],
  ["всіх смішить", "смішить усіх"],
]);

function contentIntents(settings: QuestionContentSettings | null | undefined): ContentIntent[] {
  const raw = settings?.content_intents;
  return Array.isArray(raw) ? raw : [];
}

export type FamilyFeudOriginal = {
  id: string;
  value: string;
  respondent: string;
  groupKey: string;
};

export type FamilyFeudGroup = {
  key: string;
  label: string;
  points: number;
  originals: FamilyFeudOriginal[];
};

export type FamilyFeudAnalysis = {
  prompt: string;
  usableCount: number;
  groups: FamilyFeudGroup[];
  top: FamilyFeudGroup[];
  gems: FamilyFeudOriginal[];
  sourceAnswerIds: string[];
  lowPotential: boolean;
};

export function normalizeFamilyFeudValue(value: string) {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(він|вона|вони)\s+(завжди\s+)?/u, "")
    .trim();
  return SAFE_ALIASES.get(normalized) ?? normalized;
}

function answerValue(answer: EventSubmission["answers"][number]) {
  if (answer.answer_text?.trim()) return answer.answer_text.trim();
  if (typeof answer.answer_json === "string") return answer.answer_json.trim();
  return "";
}

function isMeaningful(value: string) {
  const normalized = normalizeFamilyFeudValue(value);
  return normalized.length >= 2 && !MEANINGLESS.has(normalized) && !OBVIOUS_UNSAFE.test(normalized);
}

export function isFamilyFeudPromptEligible(prompt: string) {
  return Boolean(prompt.trim()) && !NON_SURVEY_PROMPT.test(prompt) && !STORY_PROMPT.test(prompt) && !WHO_SAID_PROMPT.test(prompt);
}

function isFamilyFeudQuestionEligible(answer: EventSubmission["answers"][number]) {
  const settings = answer.question?.settings;
  const intents = contentIntents(settings);
  if (intents.length) return intents.includes("family_feud");
  return isFamilyFeudPromptEligible(answer.question?.prompt ?? "");
}

export function buildFamilyFeudAnalyses(submissions: EventSubmission[]): FamilyFeudAnalysis[] {
  const byQuestion = new Map<string, { prompt: string; originals: FamilyFeudOriginal[] }>();
  for (const submission of submissions) {
    for (const answer of submission.answers) {
      const prompt = answer.question?.prompt?.trim() ?? "";
      const value = answerValue(answer);
      if (!isFamilyFeudQuestionEligible(answer)
        || answer.question?.type === "media"
        || answer.do_not_use
        || answer.moderation_status !== "approved"
        || answer.privacy_status !== "public_allowed"
        || !isMeaningful(value)) continue;
      const groupKey = normalizeFamilyFeudValue(value);
      const original: FamilyFeudOriginal = {
        id: answer.id,
        value,
        respondent: submission.respondent?.display_name?.trim() || "Без імені",
        groupKey,
      };
      const questionKey = answer.question?.id ?? prompt;
      const entry = byQuestion.get(questionKey) ?? { prompt, originals: [] };
      entry.originals.push(original);
      byQuestion.set(questionKey, entry);
    }
  }

  return [...byQuestion.values()].map(({ prompt, originals }) => {
    const grouped = new Map<string, FamilyFeudOriginal[]>();
    for (const original of originals) grouped.set(original.groupKey, [...(grouped.get(original.groupKey) ?? []), original]);
    const groups = [...grouped.entries()]
      .map(([key, values]) => ({ key, label: values[0].value.slice(0, 90), points: values.length, originals: values }))
      .sort((a, b) => b.points - a.points || a.label.localeCompare(b.label, "uk"));
    const top = groups.slice(0, FAMILY_FEUD_TOP_SIZE);
    const topKeys = new Set(top.map((group) => group.key));
    const gems = groups
      .filter((group) => !topKeys.has(group.key) && group.points <= 2)
      .flatMap((group) => group.originals)
      .filter((original) => original.value.trim().length >= 12)
      .sort((a, b) => b.value.length - a.value.length);
    return {
      prompt,
      usableCount: originals.length,
      groups,
      top,
      gems,
      sourceAnswerIds: originals.map((answer) => answer.id),
      lowPotential: originals.length < FAMILY_FEUD_MIN_USABLE_ANSWERS || groups.length < FAMILY_FEUD_MIN_GROUPS,
    };
  }).sort((a, b) => b.usableCount - a.usableCount);
}

export function findFamilyFeudAnalysis(
  submissions: EventSubmission[],
  prompt: string,
  sourceAnswerIds: Iterable<string>,
) {
  const allowed = new Set(sourceAnswerIds);
  const scoped = submissions.map((submission) => ({
    ...submission,
    answers: submission.answers.filter((answer) => allowed.has(answer.id)),
  }));
  return buildFamilyFeudAnalyses(scoped).find((analysis) => analysis.prompt === prompt) ?? null;
}

export function findFamilyFeudOriginal(submissions: EventSubmission[], eventAnswerId: string) {
  for (const submission of submissions) {
    const answer = submission.answers.find((candidate) => candidate.id === eventAnswerId);
    if (!answer) continue;
    const value = answerValue(answer);
    if (answer.do_not_use
      || answer.moderation_status !== "approved"
      || answer.privacy_status !== "public_allowed"
      || answer.question?.type === "media"
      || !isMeaningful(value)) return null;
    return {
      id: answer.id,
      value,
      respondent: submission.respondent?.display_name?.trim() || "Без імені",
      groupKey: normalizeFamilyFeudValue(value),
    } satisfies FamilyFeudOriginal;
  }
  return null;
}

export function revealNextFamilyFeudAnswer(data: Record<string, unknown>) {
  const answers = Array.isArray(data.answers) ? data.answers : [];
  return {
    ...data,
    revealed_count: Math.min(Number(data.revealed_count ?? 0) + 1, answers.length),
    stage: "reveal",
  };
}

export function revealFamilyFeudAnswerAt(data: Record<string, unknown>, index: number) {
  const answers = Array.isArray(data.answers) ? data.answers : [];
  if (data.generator !== "family_feud_v4" || index < 0 || index >= answers.length) return data;
  const revealed = Array.isArray(data.revealed_indexes)
    ? data.revealed_indexes.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value < answers.length)
    : [];
  return { ...data, stage: "reveal", revealed_indexes: [...new Set([...revealed, index])].sort((a, b) => a - b) };
}

export function replaceFamilyFeudBoardSlot(data: Record<string, unknown>, slotIndex: number, group: FamilyFeudGroup) {
  const answers = Array.isArray(data.answers) ? [...data.answers] : [];
  if (data.generator !== "family_feud_v4" || slotIndex < 0 || slotIndex >= answers.length) return data;
  answers[slotIndex] = { label: group.label, points: group.points };
  const revealed = Array.isArray(data.revealed_indexes) ? data.revealed_indexes.map(Number).filter((value) => value !== slotIndex) : [];
  return { ...data, answers, revealed_indexes: revealed };
}

export function hideFamilyFeudGem(data: Record<string, unknown>) {
  const { gem_author: _author, selected_gem: _gem, ...safeData } = data;
  void _author;
  void _gem;
  return { ...safeData, gem_visible: false, gem_author_visible: false };
}

export function showFamilyFeudGem(data: Record<string, unknown>, value: string) {
  const { gem_author: _author, ...safeData } = data;
  void _author;
  return { ...safeData, selected_gem: value.slice(0, 500), gem_visible: true, gem_author_visible: false };
}

export function revealFamilyFeudGemAuthor(data: Record<string, unknown>, value: string, author: string) {
  return {
    ...data,
    selected_gem: value.slice(0, 500),
    gem_visible: true,
    gem_author_visible: true,
    gem_author: author,
  };
}
