"use server";

import { redirect } from "next/navigation";
import { requireUser, getAccessToken } from "@/lib/auth/session";
import { supabaseRest } from "@/lib/supabase/rest";
import { EVENT_TYPES, type TyamaEvent } from "@/lib/events/types";

export type CreateEventState = {
  error?: string;
  fields?: { title?: string; clientName?: string; eventDate?: string; eventType?: string; location?: string };
};

export type UpdateEventState = {
  success?: boolean;
  error?: string;
};

async function ownedEventContext(eventId: string) {
  const user = await requireUser();
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");
  const rows = await supabaseRest<Array<Pick<TyamaEvent, "id" | "host_id">>>(
    `events?select=id,host_id&id=eq.${encodeURIComponent(eventId)}&limit=1`,
    { accessToken },
  );
  if (!rows[0] || rows[0].host_id !== user.id) throw new Error("Event not found");
  return { accessToken };
}

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

export async function updateEventAction(
  eventId: string,
  _: UpdateEventState,
  formData: FormData,
): Promise<UpdateEventState> {
  const { accessToken } = await ownedEventContext(eventId);
  const title = String(formData.get("title") ?? "").trim().slice(0, 160);
  const eventType = String(formData.get("eventType") ?? "");
  if (!title) return { error: "Додайте назву події." };
  if (!EVENT_TYPES.includes(eventType as (typeof EVENT_TYPES)[number])) {
    return { error: "Оберіть тип події." };
  }
  try {
    await supabaseRest(`events?id=eq.${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      accessToken,
      body: JSON.stringify({
        title,
        event_type: eventType,
        client_name: String(formData.get("clientName") ?? "").trim().slice(0, 300) || null,
        event_date: String(formData.get("eventDate") ?? "") || null,
        location: String(formData.get("location") ?? "").trim().slice(0, 500) || null,
        internal_notes: String(formData.get("internalNotes") ?? "").trim().slice(0, 5000) || null,
      }),
    });
    return { success: true };
  } catch {
    return { error: "Зміни не збережено. Введені дані залишилися у формі — спробуйте ще раз." };
  }
}

export async function setEventArchivedAction(eventId: string, archived: boolean) {
  const { accessToken } = await ownedEventContext(eventId);
  await supabaseRest(`events?id=eq.${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ status: archived ? "archived" : "draft" }),
  });
  redirect(archived ? "/dashboard" : `/events/${eventId}`);
}
