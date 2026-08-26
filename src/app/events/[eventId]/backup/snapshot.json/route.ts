import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createEventSnapshot } from "@/lib/backup/snapshot";

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { eventId } = await params;
  const snapshot = await createEventSnapshot(eventId);
  if (!snapshot || snapshot.event.host_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(snapshot, {
    headers: {
      "Content-Disposition": `attachment; filename="tyama-${eventId}-snapshot.json"`,
      "Cache-Control": "no-store",
    },
  });
}
