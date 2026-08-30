export const QUESTIONNAIRE_AUDIENCES = ["customer", "guest", "bride", "groom", "couple", "other"] as const;
export type QuestionnaireAudience = (typeof QUESTIONNAIRE_AUDIENCES)[number];

export const QUESTION_TYPES = ["short_text", "long_text", "single_select", "multi_select", "boolean", "media"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type Questionnaire = {
  id: string;
  host_id: string;
  event_id: string;
  audience: QuestionnaireAudience;
  title: string;
  description: string | null;
  status: "draft" | "published" | "paused" | "closed";
  published_revision_id: string | null;
  draft_revision_id: string | null;
  public_token_hash: string | null;
  allow_images: boolean;
  allow_video: boolean;
  allow_audio: boolean;
  created_at: string;
  updated_at: string;
};

export type Question = {
  id: string;
  host_id: string;
  event_id: string;
  questionnaire_id: string;
  type: QuestionType;
  prompt: string;
  help_text: string | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  settings: import("@/lib/questionnaires/content-intents").QuestionContentSettings;
  default_privacy: "host_only" | "review_required" | "public_allowed";
  created_at: string;
  updated_at: string;
};

export const AUDIENCE_LABELS: Record<QuestionnaireAudience, string> = {
  customer: "Замовники",
  guest: "Гості",
  bride: "Наречена",
  groom: "Наречений",
  couple: "Пара",
  other: "Інша аудиторія",
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Коротка відповідь",
  long_text: "Розгорнута відповідь",
  single_select: "Один варіант",
  multi_select: "Кілька варіантів",
  boolean: "Так / ні",
  media: "Файл",
};
