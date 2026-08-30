export type PublicMedia = { url: string; kind: string; mime_type: string };
export type BoundPublicMedia = PublicMedia & { assetId: string };
export function mediaForCurrentAsset(media: BoundPublicMedia | null, assetId: string | undefined) { return assetId && media?.assetId === assetId ? media : null; }
