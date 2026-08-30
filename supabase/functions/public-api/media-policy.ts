export type PublicMediaPayload = { item_type?: string; data?: Record<string, unknown> | null };
export function payloadAuthorizesPublicMedia(item: PublicMediaPayload | null, assetId: string) {
  if (!item?.data) return false;
  const assetIds = Array.isArray(item.data.asset_ids) ? item.data.asset_ids.map(String) : [];
  if (!assetIds.includes(assetId)) return false;
  if (item.item_type === "media") return true;
  return item.item_type === "interactive" && item.data.interactive_kind === "who_said" && item.data.revealed === true;
}
