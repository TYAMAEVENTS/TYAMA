import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createResponsesCsv } from "@/lib/backup/snapshot";
import { getEvent } from "@/lib/events/data";

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event || event.host_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const csv = await createResponsesCsv(eventId);
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tyama-${eventId}-responses.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
