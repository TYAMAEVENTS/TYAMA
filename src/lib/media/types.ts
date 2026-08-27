export type MediaAsset = {
  id: string;
  kind: "image" | "video" | "audio" | "other";
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
  status: "pending" | "ready" | "rejected" | "deleted";
  privacy_status: "host_only" | "review_required" | "public_allowed";
  moderation_status: "pending" | "approved" | "rejected";
};
