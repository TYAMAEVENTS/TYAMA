import type { EventKitType } from "@/lib/event-kit/types";
import type { EventSubmission } from "@/lib/responses/data";
import { buildFamilyFeudAnalyses } from "@/lib/event-kit/family-feud";

export type SmartEventKitDraft = {
  generatorKey: string;
  itemType: EventKitType;
  title: string;
  content: string;
  sourceRefs: Array<{ type: "answer" | "media_asset"; id: string }>;
  data: Record<string, unknown>;
};

type UsableAnswer = {
  id: string;
  prompt: string;
  value: string;
  respondent: string;
};

const WHO_SAID_PROMPT = /опишіть.+одн(ією|ою) фраз|трьома словами|яке слово найкраще описує/i;

function answerValue(answer: EventSubmission["answers"][number]) {
  if (answer.answer_text?.trim()) return answer.answer_text.trim();
  if (answer.answer_json === null || answer.answer_json === undefined) return "";
  if (typeof answer.answer_json === "string") return answer.answer_json.trim();
  return JSON.stringify(answer.answer_json);
}

function collectAnswers(submissions: EventSubmission[]): UsableAnswer[] {
  return submissions.flatMap((submission) => submission.answers.flatMap((answer) => {
    const value = answerValue(answer);
    if (!value
      || answer.do_not_use
      || answer.moderation_status !== "approved"
      || answer.privacy_status !== "public_allowed"
      || answer.question?.type === "media") return [];
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

  const drafts: SmartEventKitDraft[] = [];
  for (const analysis of buildFamilyFeudAnalyses(submissions).filter((candidate) => !candidate.lowPotential).slice(0, 10)) {
    drafts.push({
      generatorKey: `family-feud-v3:${analysis.prompt}`,
      itemType: "interactive",
      title: "100 зі 100",
      content: analysis.prompt,
      sourceRefs: analysis.sourceAnswerIds.map((id) => ({ type: "answer", id })),
      data: {
        generator: "family_feud_v3",
        schema_version: 3,
        interactive_kind: "family_feud",
        stage: "intro",
        prompt: analysis.prompt,
        answers: analysis.top.map((group) => ({ label: group.label, points: group.points })),
        revealed_count: 0,
        response_count: analysis.usableCount,
        selected_gem: null,
        gem_visible: false,
        gem_author_visible: false,
      },
    });
  }

  const quotes = answers.filter((answer) => WHO_SAID_PROMPT.test(answer.prompt)).slice(0, 20);
  for (const quote of quotes) {
    drafts.push({
      generatorKey: `smart-who-said-v2:${quote.id}`,
      itemType: "interactive",
      title: "Хто це сказав?",
      content: clip(quote.value, 500),
      sourceRefs: [{ type: "answer", id: quote.id }],
      data: { generator: "interactive_builder_v2", interactive_kind: "who_said", stage: "intro", quote: clip(quote.value, 500), author: quote.respondent, revealed: false },
    });
  }

  const mediaAssets = submissions.flatMap((submission) => submission.answers.flatMap((answer) =>
    answer.media_assets.filter((asset) => asset.status === "ready" && asset.moderation_status !== "rejected" && asset.privacy_status !== "host_only"),
  ));
  const uniqueMedia = [...new Map(mediaAssets.map((asset) => [asset.id, asset])).values()].slice(0, 50);
  if (uniqueMedia.length) {
    drafts.push({
      generatorKey: `smart-slideshow-v2:${uniqueMedia.map((asset) => asset.id).sort().join(":")}`,
      itemType: "media",
      title: "Слайдшоу гостей",
      content: `${uniqueMedia.length} фото, відео або аудіо з анкет гостей`,
      sourceRefs: uniqueMedia.map((asset) => ({ type: "media_asset", id: asset.id })),
      data: { generator: "interactive_builder_v2", interactive_kind: "slideshow", stage: "intro", asset_ids: uniqueMedia.map((asset) => asset.id), current_index: 0 },
    });
  }

  return drafts;
}
