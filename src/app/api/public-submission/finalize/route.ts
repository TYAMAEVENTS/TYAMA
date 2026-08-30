import { NextResponse } from "next/server";
import { supabaseEdge } from "@/lib/supabase/edge";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const draftCapability = String(body.draftCapability ?? "");
    const sourceSetHash = String(body.sourceSetHash ?? "");
    const consentVersion = String(body.consentVersion ?? "");
    if (!/^[0-9a-f]{64}$/.test(draftCapability) || !/^[0-9a-f]{64}$/.test(sourceSetHash) || !consentVersion) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const result = await supabaseEdge({ action: "finalize_submission_draft", draft_capability_hash: draftCapability, source_set_hash: sourceSetHash, consent_version: consentVersion, consent: body.consent === true });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Finalization failed" }, { status: 400 });
  }
}
