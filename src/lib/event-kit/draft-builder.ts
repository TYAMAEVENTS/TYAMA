import type { EventKitType } from "@/lib/event-kit/types";
import type { EventSubmission } from "@/lib/responses/data";
import { buildFamilyFeudAnalyses } from "./family-feud.ts";
import { analyzeWhoSaidCandidates } from "./who-said.ts";
import { isPublicReadyMedia } from "./readiness.ts";

export type SmartEventKitDraft = {
  generatorKey: string;
  itemType: EventKitType;
  title: string;
  content: string;
  sourceRefs: Array<{ type: "answer" | "media_asset"; id: string }>;
  data: Record<string, unknown>;
};

function clip(value: string, length = 700) {
  return value.length > length ? `${value.slice(0, length - 1).trim()}…` : value;
}

export function buildSmartEventKitDrafts(submissions: EventSubmission[]): SmartEventKitDraft[] {
  const drafts: SmartEventKitDraft[] = [];
  for (const analysis of buildFamilyFeudAnalyses(submissions).filter((candidate) => !candidate.lowPotential).slice(0, 10)) {
    drafts.push({
      generatorKey: `family-feud-v4:${analysis.prompt}`,
      itemType: "interactive",
      title: "100 зі 100",
      content: analysis.prompt,
      sourceRefs: analysis.sourceAnswerIds.map((id) => ({ type: "answer", id })),
      data: {
        generator: "family_feud_v4",
        schema_version: 4,
        interactive_kind: "family_feud",
        stage: "intro",
        prompt: analysis.prompt,
        answers: analysis.top.map((group) => ({ label: group.label, points: group.points })),
        revealed_indexes: [],
        response_count: analysis.usableCount,
        selected_gem: null,
        gem_visible: false,
        gem_author_visible: false,
      },
    });
  }

  const quotes = analyzeWhoSaidCandidates(submissions).ready.slice(0, 40);
  for (const quote of quotes) {
    drafts.push({
      generatorKey: `smart-who-said-v3:${quote.answerId}`,
      itemType: "interactive",
      title: "Хто це сказав?",
      content: clip(quote.quote, 500),
      sourceRefs: [
        { type: "answer", id: quote.answerId },
        ...(quote.selfieAssetId ? [{ type: "media_asset" as const, id: quote.selfieAssetId }] : []),
      ],
      data: { generator: "who_said_v3", schema_version: 3, interactive_kind: "who_said", stage: "intro", quote: clip(quote.quote, 500), has_selfie: true, revealed: false, readiness: "ready" },
    });
  }

  const mediaAssets = submissions.flatMap((submission) => submission.answers.flatMap((answer) =>
    answer.media_assets.filter(isPublicReadyMedia),
  ));
  const uniqueMedia = [...new Map(mediaAssets.map((asset) => [asset.id, asset])).values()].slice(0, 50);
  if (uniqueMedia.length) {
    drafts.push({
      generatorKey: "auto-slideshow-v1",
      itemType: "media",
      title: "Слайдшоу гостей",
      content: `${uniqueMedia.length} фото, відео або аудіо з анкет гостей`,
      sourceRefs: uniqueMedia.map((asset) => ({ type: "media_asset", id: asset.id })),
      data: { generator: "interactive_builder_v2", interactive_kind: "slideshow", stage: "intro", asset_ids: uniqueMedia.map((asset) => asset.id), current_index: 0 },
    });
  }

  return drafts;
}
