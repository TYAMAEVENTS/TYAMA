import "server-only";
import { getAccessToken } from "@/lib/auth/session";
import { supabaseRest } from "@/lib/supabase/rest";
import type { QuestionnaireAudience, QuestionType } from "@/lib/questionnaires/types";
import type { MediaAsset } from "@/lib/media/types";

export type EventSubmission = {
  id: string;
  status: "draft" | "submitted" | "reviewed" | "rejected";
  submitted_at: string | null;
  created_at: string;
  respondent: { display_name: string | null; relationship_label: string | null } | null;
  questionnaire: { title: string; audience: QuestionnaireAudience } | null;
  answers: Array<{
    id: string;
    answer_text: string | null;
    answer_json: unknown;
    privacy_status: "host_only" | "review_required" | "public_allowed";
    moderation_status: "pending" | "approved" | "rejected";
    is_useful: boolean;
    do_not_use: boolean;
    question: { id: string; prompt: string; type: QuestionType; settings: import("@/lib/questionnaires/content-intents").QuestionContentSettings } | null;
    media_assets: MediaAsset[];
  }>;
};

export async function listEventSubmissions(eventId: string): Promise<EventSubmission[]> {
  const accessToken = await getAccessToken();
  if (!accessToken) return [];
  return supabaseRest<EventSubmission[]>(
    `submissions?select=id,status,submitted_at,created_at,respondent:respondents(display_name,relationship_label),questionnaire:questionnaires(title,audience),answers(id,answer_text,answer_json,privacy_status,moderation_status,is_useful,do_not_use,question:questions(id,prompt,type,settings),media_assets(id,kind,original_filename,mime_type,size_bytes,status,privacy_status,moderation_status))&event_id=eq.${encodeURIComponent(eventId)}&status=neq.draft&order=created_at.desc`,
    { accessToken },
  );
}
