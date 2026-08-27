export type LiveSession = {
  id: string;
  host_id: string;
  event_id: string;
  mode: "rehearsal" | "live";
  status: "active" | "ended";
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

export type PublicPayload = {
  kind?: "message" | "question" | "reveal" | "media" | "clear";
  item_type?: string;
  title?: string | null;
  content?: string | null;
  session_mode?: "rehearsal" | "live";
};

export type LiveState = {
  event_id: string;
  host_id: string;
  live_session_id: string | null;
  revision: number;
  mode: "idle" | "message" | "question" | "reveal" | "media" | "clear";
  source_event_kit_item_id: string | null;
  public_payload: PublicPayload;
  updated_at: string;
};

export type PublicScreenState = Pick<LiveState, "revision" | "mode" | "public_payload" | "updated_at"> & {
  event_title: string;
};
