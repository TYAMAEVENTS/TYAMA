import { NextResponse } from "next/server";
import { capabilityHash } from "@/lib/questionnaires/tokens";
import { supabaseEdge } from "@/lib/supabase/edge";

export async function GET(_: Request, { params }: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await params;
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(assetId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const media = await supabaseEdge<{ url: string; kind: string; mime_type: string }>({
      action: "get_public_media",
      token_hash: capabilityHash(token),
      asset_id: assetId,
    });
    return NextResponse.json(media, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
