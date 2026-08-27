"use server";

import { redirect } from "next/navigation";
import { requireUser, getAccessToken } from "@/lib/auth/session";
import { supabaseRest } from "@/lib/supabase/rest";
import { EVENT_TYPES, type TyamaEvent } from "@/lib/events/types";

export type CreateEventState = {
  error?: string;
  fields?: { title?: string; clientName?: string; eventDate?: string; eventType?: string; location?: string };
};

export async function createEventAction(_: CreateEventState, formData: FormData): Promise<CreateEventState> {
  const user = await requireUser();
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");

  const fields = {
    title: String(formData.get("title") ?? "").trim(),
    clientName: String(formData.get("clientName") ?? "").trim(),
    eventDate: String(formData.get("eventDate") ?? ""),
    eventType: String(formData.get("eventType") ?? ""),
    location: String(formData.get("location") ?? "").trim(),
  };

  if (!fields.title) return { error: "Додайте назву події.", fields };
  if (!EVENT_TYPES.includes(fields.eventType as (typeof EVENT_TYPES)[number])) {
    return { error: "Оберіть тип події.", fields };
  }

  let event: TyamaEvent | undefined;
  try {
    const rows = await supabaseRest<TyamaEvent[]>("events", {
      method: "POST",
      accessToken,
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        host_id: user.id,
        title: fields.title,
        client_name: fields.clientName || null,
        event_date: fields.eventDate || null,
        event_type: fields.eventType,
        location: fields.location || null,
        status: "draft",
      }),
    });
    event = rows[0];
  } catch {
    return { error: "Подію не створено. Дані збережені у формі — спробуйте ще раз.", fields };
  }

  if (!event) return { error: "Подію не створено. Спробуйте ще раз.", fields };
  redirect(`/events/${event.id}`);
}
