export const CONTENT_INTENTS = ["family_feud", "who_said", "story", "media", "trivia"] as const;
export type ContentIntent = (typeof CONTENT_INTENTS)[number];

export type QuestionContentSettings = {
  schema_version?: 1;
  template_id?: string;
  template_version?: number;
  semantic_key?: string;
  module_key?: string;
  module_role?: "primary" | "companion";
  topic?: string;
  tone?: "neutral" | "warm" | "fun" | "playful";
  options?: string[];
  content_intents?: ContentIntent[];
  who_said_priority?: number;
  who_said_role?: "quote" | "selfie";
  media_role?: "who_said_selfie" | "gallery" | "story_reference" | "host_only";
  media_constraints?: {
    allowed_kinds: Array<"image" | "video" | "audio">;
    max_files: number;
    capture?: "user" | "environment";
    public_image_policy?: "automatic_with_consent" | "review_required" | "host_only";
    video_policy?: "review_required" | "host_only";
    audio_policy?: "review_required" | "host_only";
  };
  public_source_policy?: "automatic_with_consent" | "review_required" | "host_only";
};

export function questionContentIntents(settings: unknown): ContentIntent[] {
  if (!settings || typeof settings !== "object") return [];
  const raw = (settings as Record<string, unknown>).content_intents;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is ContentIntent => CONTENT_INTENTS.includes(value as ContentIntent));
}

export function questionHasIntent(settings: unknown, intent: ContentIntent) {
  return questionContentIntents(settings).includes(intent);
}
