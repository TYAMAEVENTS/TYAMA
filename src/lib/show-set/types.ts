export type ShowSetItem = {
  id: string;
  source_event_kit_item_id: string;
  host_order: number | null;
  included: boolean;
  readiness: "ready" | "needs_attention" | "blocked" | "stale";
  public_eligible: boolean;
  attention_state: "new" | "unchanged" | "changed" | "stale";
  blocker_reason: string | null;
  event_kit_items: { item_type: string; title: string | null; content: string | null; data: Record<string, unknown> } | null;
};

export type ShowSet = {
  id: string;
  event_id: string;
  row_version: number;
  current_revision_id: string | null;
  prepared_at: string | null;
  show_set_items: ShowSetItem[];
  show_set_revisions: Array<{ id: string; revision_number: number; snapshot_hash: string; created_at: string }>;
};

export type ShowSession = {
  id: string;
  mode: "rehearsal" | "live";
  status: "active" | "ended";
  show_set_id: string | null;
  show_set_revision_id: string | null;
  snapshot_hash: string | null;
  current_position: number;
  current_stage: string;
  runtime_version: number;
};

export type RehearsalState = { revision: number; current_position: number; stage: string; private_payload: Record<string, unknown> };

