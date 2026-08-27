import { NextRequest, NextResponse } from "next/server";
import { capabilityHash } from "@/lib/questionnaires/tokens";
import { supabaseEdge } from "@/lib/supabase/edge";

function requestIsSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!requestIsSameOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const token = String(body.token ?? "");
  const idempotencyKey = String(body.idempotencyKey ?? "");
  const assetId = String(body.assetId ?? "");
  if (
    !/^[A-Za-z0-9_-]{40,64}$/.test(token)
    || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
    || !/^[0-9a-f-]{36}$/i.test(assetId)
  ) return NextResponse.json({ error: "Invalid media request" }, { status: 400 });

  try {
    const completed = await supabaseEdge<{ asset_id: string; status: "ready" }>({
      action: "complete_media_upload",
      submission_capability_hash: capabilityHash(`${token}:${idempotencyKey}`),
      asset_id: assetId,
    });
    return NextResponse.json(completed, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Upload validation failed" }, { status: 400 });
  }
}
