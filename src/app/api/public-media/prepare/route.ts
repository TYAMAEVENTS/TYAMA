import { NextRequest, NextResponse } from "next/server";
import { capabilityHash } from "@/lib/questionnaires/tokens";
import { supabaseEdge } from "@/lib/supabase/edge";

type PreparedUpload = {
  asset_id: string;
  storage_path: string;
  kind: "image" | "video" | "audio";
  upload_url: string;
  upload_token: string;
};

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
  const questionId = String(body.questionId ?? "");
  const filename = String(body.filename ?? "").trim().slice(0, 255);
  const mimeType = String(body.mimeType ?? "");
  const sizeBytes = Number(body.sizeBytes ?? 0);
  if (
    !/^[A-Za-z0-9_-]{40,64}$/.test(token)
    || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
    || !/^[0-9a-f-]{36}$/i.test(questionId)
    || !filename
    || !Number.isSafeInteger(sizeBytes)
  ) return NextResponse.json({ error: "Invalid media request" }, { status: 400 });

  try {
    const prepared = await supabaseEdge<PreparedUpload>({
      action: "prepare_media_upload",
      token_hash: capabilityHash(token),
      submission_capability_hash: capabilityHash(`${token}:${idempotencyKey}`),
      question_id: questionId,
      original_filename: filename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    });
    return NextResponse.json(prepared, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Upload is not allowed" }, { status: 400 });
  }
}
