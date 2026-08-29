import type { EventSubmission } from "@/lib/responses/data";
import type { ContentIntent, QuestionContentSettings } from "@/lib/questionnaires/content-intents";

const LEGACY_WHO_SAID_PROMPT = /опишіть.+одн(ією|ою) фраз|трьома словами|яке слово найкраще описує|одним реченням|закінчи речення|асоціюється/i;
const LEGACY_SELFIE_PROMPT = /селфі.*зараз|зроби.*селфі/i;

function contentIntents(settings: QuestionContentSettings | null | undefined): ContentIntent[] {
  const raw = settings?.content_intents;
  return Array.isArray(raw) ? raw : [];
}

export type WhoSaidCandidate = {
  submissionId: string;
  answerId: string;
  quote: string;
  author: string;
  selfieAssetId: string | null;
};

function answerText(answer: EventSubmission["answers"][number]) {
  if (answer.answer_text?.trim()) return answer.answer_text.trim();
  if (typeof answer.answer_json === "string") return answer.answer_json.trim();
  return "";
}

function quotePriority(answer: EventSubmission["answers"][number]) {
  const settings = answer.question?.settings;
  if (contentIntents(settings).includes("who_said")) {
    const priority = Number(settings?.who_said_priority ?? 100);
    return Number.isFinite(priority) ? priority : 100;
  }
  if (!contentIntents(settings).length && LEGACY_WHO_SAID_PROMPT.test(answer.question?.prompt ?? "")) return 500;
  return null;
}

function isSelfieAnswer(answer: EventSubmission["answers"][number]) {
  const settings = answer.question?.settings;
  return settings?.who_said_role === "selfie"
    || (!contentIntents(settings).length && LEGACY_SELFIE_PROMPT.test(answer.question?.prompt ?? ""));
}

export function buildWhoSaidCandidates(submissions: EventSubmission[]): WhoSaidCandidate[] {
  return submissions.flatMap((submission) => {
    const quotes = submission.answers.flatMap((answer) => {
      const priority = quotePriority(answer);
      const quote = answerText(answer);
      if (priority === null || !quote || answer.do_not_use || answer.moderation_status !== "approved" || answer.privacy_status !== "public_allowed") return [];
      return [{ answer, priority, quote }];
    }).sort((a, b) => a.priority - b.priority);
    const selected = quotes[0];
    if (!selected) return [];
    const selfie = submission.answers
      .filter(isSelfieAnswer)
      .flatMap((answer) => answer.media_assets)
      .find((asset) => asset.kind === "image" && asset.status === "ready" && asset.moderation_status !== "rejected" && asset.privacy_status !== "host_only");
    return [{
      submissionId: submission.id,
      answerId: selected.answer.id,
      quote: selected.quote,
      author: submission.respondent?.display_name?.trim() || "Без імені",
      selfieAssetId: selfie?.id ?? null,
    }];
  });
}

export function findWhoSaidCandidate(submissions: EventSubmission[], answerId: string) {
  return buildWhoSaidCandidates(submissions).find((candidate) => candidate.answerId === answerId) ?? null;
}

export function revealWhoSaidCandidate(data: Record<string, unknown>, candidate: WhoSaidCandidate) {
  return {
    ...data,
    revealed: true,
    author: candidate.author.slice(0, 160),
    asset_ids: candidate.selfieAssetId ? [candidate.selfieAssetId] : [],
  };
}

export function hideWhoSaidAuthor(data: Record<string, unknown>) {
  const { author: _author, asset_ids: _assets, ...safe } = data;
  void _author;
  void _assets;
  return { ...safe, revealed: false };
}
