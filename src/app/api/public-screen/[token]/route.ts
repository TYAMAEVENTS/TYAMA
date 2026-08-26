import { NextResponse } from "next/server";
import { getPublicScreenState } from "@/lib/live/data";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await getPublicScreenState(token);
  if (!state) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
