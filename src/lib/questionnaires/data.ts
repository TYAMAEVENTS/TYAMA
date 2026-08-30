import "server-only";
import { getAccessToken } from "@/lib/auth/session";
import { supabaseRest } from "@/lib/supabase/rest";
import { supabaseEdge } from "@/lib/supabase/edge";
import { capabilityHash } from "@/lib/questionnaires/tokens";
import type { Questionnaire, Question } from "@/lib/questionnaires/types";

export async function listQuestionnaires(eventId: string): Promise<Questionnaire[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];
  return supabaseRest<Questionnaire[]>(
    `questionnaires?select=*&event_id=eq.${encodeURIComponent(eventId)}&order=created_at.asc`,
    { accessToken },
  );
}

export async function getQuestionnaire(questionnaireId: string, eventId: string): Promise<Questionnaire | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  const rows = await supabaseRest<Questionnaire[]>(
    `questionnaires?select=*&id=eq.${encodeURIComponent(questionnaireId)}&event_id=eq.${encodeURIComponent(eventId)}&limit=1`,
    { accessToken },
  );
  return rows[0] ?? null;
}

export async function listQuestions(questionnaireId: string, eventId: string): Promise<Question[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];
  const questionnaires = await supabaseRest<Questionnaire[]>(`questionnaires?select=*&id=eq.${encodeURIComponent(questionnaireId)}&event_id=eq.${encodeURIComponent(eventId)}&limit=1`, { accessToken });
  const revisionId = questionnaires[0]?.draft_revision_id ?? questionnaires[0]?.published_revision_id;
  if (!revisionId) return [];
  const memberships = await supabaseRest<Array<{ sort_order: number; is_required: boolean; is_active: boolean; questions: Question | Question[] }>>(`questionnaire_revision_questions?select=sort_order,is_required,is_active,questions(*)&revision_id=eq.${encodeURIComponent(revisionId)}&order=sort_order.asc`, { accessToken });
  return memberships.flatMap((membership) => {
    const question = Array.isArray(membership.questions) ? membership.questions[0] : membership.questions;
    return question ? [{ ...question, sort_order: membership.sort_order, is_required: membership.is_required, is_active: membership.is_active }] : [];
  });
}

export type PublicQuestionnaire = Pick<Questionnaire, "id" | "title" | "description" | "audience" | "allow_images" | "allow_video" | "allow_audio"> & {
  revision_id: string;
  source_set_hash: string;
  policy_version: string;
  collection_state: "published" | "paused" | "closed";
  questions: Array<Pick<Question, "id" | "type" | "prompt" | "help_text" | "is_required" | "sort_order"> & { input_config: { options?: string[]; allowed_kinds?: Array<"image" | "video" | "audio">; max_files?: number; multiple?: boolean; capture?: string; consent_copy: string; consent_version: string } }>;
};

export async function getPublicQuestionnaire(rawToken: string): Promise<PublicQuestionnaire | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(rawToken)) return null;
  const tokenHash = capabilityHash(rawToken);
  return supabaseEdge<PublicQuestionnaire | null>({ action: "get_questionnaire", token_hash: tokenHash });
}
