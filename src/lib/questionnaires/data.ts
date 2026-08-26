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
  return supabaseRest<Question[]>(
    `questions?select=*&questionnaire_id=eq.${encodeURIComponent(questionnaireId)}&event_id=eq.${encodeURIComponent(eventId)}&order=sort_order.asc,created_at.asc`,
    { accessToken },
  );
}

export type PublicQuestionnaire = Pick<Questionnaire, "id" | "title" | "description" | "audience" | "allow_images" | "allow_video" | "allow_audio"> & {
  questions: Array<Pick<Question, "id" | "type" | "prompt" | "help_text" | "is_required" | "sort_order" | "settings">>;
};

export async function getPublicQuestionnaire(rawToken: string): Promise<PublicQuestionnaire | null> {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(rawToken)) return null;
  const tokenHash = capabilityHash(rawToken);
  return supabaseEdge<PublicQuestionnaire | null>({ action: "get_questionnaire", token_hash: tokenHash });
}
