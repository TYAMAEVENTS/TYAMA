export const EVENT_KIT_TYPES = ["fact", "story", "question", "interactive", "media", "warning", "note", "other"] as const;
export type EventKitType = (typeof EVENT_KIT_TYPES)[number];

export type EventKitItem = {
  id: string;
  host_id: string;
  event_id: string;
  source_type: "manual" | "rules" | "ai";
  item_type: EventKitType;
  title: string | null;
  content: string | null;
  data: Record<string, unknown>;
  source_refs: Array<{ type: string; id: string }>;
  status: "draft" | "approved" | "rejected" | "used";
  privacy_status: "host_only" | "review_required" | "public_allowed";
  is_useful: boolean;
  do_not_use: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const EVENT_KIT_TYPE_LABELS: Record<EventKitType, string> = {
  fact: "Факт",
  story: "Історія",
  question: "Питання",
  interactive: "Інтерактив",
  media: "Медіа",
  warning: "Важливо",
  note: "Нотатка",
  other: "Інше",
};
