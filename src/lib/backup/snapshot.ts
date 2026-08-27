import "server-only";
import { getEvent } from "@/lib/events/data";
import { listEventKitItems } from "@/lib/event-kit/data";
import { getActiveLiveSession, getHostLiveState } from "@/lib/live/data";
import { listQuestionnaires } from "@/lib/questionnaires/data";
import { listEventSubmissions } from "@/lib/responses/data";

export async function createEventSnapshot(eventId: string) {
  const [event, questionnaires, submissions, eventKit, activeLiveSession, liveState] = await Promise.all([
    getEvent(eventId),
    listQuestionnaires(eventId),
    listEventSubmissions(eventId),
    listEventKitItems(eventId),
    getActiveLiveSession(eventId),
    getHostLiveState(eventId),
  ]);
  if (!event) return null;
  return {
    schema_version: 1,
    exported_at: new Date().toISOString(),
    event,
    questionnaires,
    submissions,
    event_kit: eventKit,
    live: {
      active_session: activeLiveSession,
      state: liveState,
    },
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function createResponsesCsv(eventId: string) {
  const submissions = await listEventSubmissions(eventId);
  const rows: string[][] = [[
    "submission_id", "submitted_at", "questionnaire", "audience", "respondent", "question",
    "answer", "media_asset_ids", "media_filenames", "privacy_status", "moderation_status", "is_useful", "do_not_use",
  ]];
  for (const submission of submissions) {
    for (const answer of submission.answers) {
      rows.push([
        submission.id,
        submission.submitted_at ?? submission.created_at,
        submission.questionnaire?.title ?? "",
        submission.questionnaire?.audience ?? "",
        submission.respondent?.display_name ?? "",
        answer.question?.prompt ?? "",
        answer.answer_text ?? JSON.stringify(answer.answer_json),
        answer.media_assets.map((asset) => asset.id).join(" | "),
        answer.media_assets.map((asset) => asset.original_filename || asset.id).join(" | "),
        answer.privacy_status,
        answer.moderation_status,
        String(answer.is_useful),
        String(answer.do_not_use),
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
