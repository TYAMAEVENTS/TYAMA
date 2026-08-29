export const CONTENT_INTENTS = ["family_feud", "who_said", "story", "media", "trivia"] as const;
export type ContentIntent = (typeof CONTENT_INTENTS)[number];

export type QuestionContentSettings = {
  options?: string[];
  content_intents?: ContentIntent[];
  who_said_priority?: number;
  who_said_role?: "quote" | "selfie";
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
