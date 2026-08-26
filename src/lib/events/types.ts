export const EVENT_TYPES = ["wedding", "birthday", "corporate", "other"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type TyamaEvent = {
  id: string;
  host_id: string;
  event_type: EventType;
  title: string;
  client_name: string | null;
  event_date: string | null;
  location: string | null;
  internal_notes: string | null;
  status: "draft" | "collecting" | "preparing" | "ready" | "live" | "completed" | "archived";
  created_at: string;
  updated_at: string;
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: "Весілля",
  birthday: "День народження",
  corporate: "Корпоратив",
  other: "Інша подія",
};
