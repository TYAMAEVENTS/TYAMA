import type { EventSubmission } from "@/lib/responses/data";
import { buildFamilyFeudAnalyses } from "./family-feud.ts";
import { analyzeWhoSaidCandidates } from "./who-said.ts";

export type EventReadiness = { submissions: number; answers: number; media: { total: number; ready: number; needsAttention: number }; whoSaid: { totalCandidates: number; ready: number; needsPhoto: number }; familyFeud: { readyBoards: number; lowPotential: number }; slideshow: { readyAssets: number } };

export function isPublicReadyMedia(asset: EventSubmission["answers"][number]["media_assets"][number]) {
  return asset.status === "ready" && asset.moderation_status === "approved" && asset.privacy_status === "public_allowed";
}

export function analyzeEventReadiness(submissions: EventSubmission[]): EventReadiness {
  const answers = submissions.flatMap((submission) => submission.answers);
  const media = [...new Map(answers.flatMap((answer) => answer.media_assets).map((asset) => [asset.id, asset])).values()];
  const readyMedia = media.filter(isPublicReadyMedia);
  const whoSaid = analyzeWhoSaidCandidates(submissions);
  const familyFeud = buildFamilyFeudAnalyses(submissions);
  return { submissions: submissions.length, answers: answers.length, media: { total: media.length, ready: readyMedia.length, needsAttention: media.length - readyMedia.length }, whoSaid: { totalCandidates: whoSaid.totalCandidates, ready: whoSaid.ready.length, needsPhoto: whoSaid.needsPhoto.length }, familyFeud: { readyBoards: familyFeud.filter((candidate) => !candidate.lowPotential).length, lowPotential: familyFeud.filter((candidate) => candidate.lowPotential).length }, slideshow: { readyAssets: readyMedia.length } };
}
