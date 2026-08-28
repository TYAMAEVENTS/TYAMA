"use client";

import { useActionState } from "react";
import { updateEventAction, type UpdateEventState } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";
import type { TyamaEvent } from "@/lib/events/types";

const initialState: UpdateEventState = {};

export function EventSettingsForm({ event }: { event: TyamaEvent }) {
  const [state, action, pending] = useActionState(updateEventAction.bind(null, event.id), initialState);
  return (
    <form action={action} className="editor-form" noValidate>
      {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
      {state.success ? <StatusMessage tone="success">Зміни збережено.</StatusMessage> : null}
      <div className="form-field">
        <label className="form-field__label" htmlFor="event-title">Назва події</label>
        <input id="event-title" name="title" defaultValue={event.title} required />
      </div>
      <div className="form-grid">
        <div className="form-field">
          <label className="form-field__label" htmlFor="event-type">Тип події</label>
          <select id="event-type" name="eventType" defaultValue={event.event_type}>
            <option value="wedding">Весілля</option><option value="birthday">День народження</option>
            <option value="corporate">Корпоратив</option><option value="other">Інша подія</option>
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="event-date">Дата</label>
          <input id="event-date" name="eventDate" type="date" defaultValue={event.event_date ?? ""} />
        </div>
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor="event-client">Клієнти / герої події</label>
        <input id="event-client" name="clientName" defaultValue={event.client_name ?? ""} />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor="event-location">Локація</label>
        <input id="event-location" name="location" defaultValue={event.location ?? ""} />
      </div>
      <div className="form-field">
        <label className="form-field__label" htmlFor="event-notes">Приватні нотатки ведучого</label>
        <textarea className="resize-none" id="event-notes" name="internalNotes" defaultValue={event.internal_notes ?? ""} />
        <p className="form-field__hint">Не потрапляють у публічну анкету або Public Screen.</p>
      </div>
      <div className="form-actions"><Button type="submit" busy={pending}>Зберегти зміни</Button></div>
    </form>
  );
}
