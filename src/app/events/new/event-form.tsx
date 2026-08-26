"use client";

import { useActionState } from "react";
import { createEventAction, type CreateEventState } from "@/app/actions/events";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";

const initialState: CreateEventState = {};

export function EventForm() {
  const [state, action, pending] = useActionState(createEventAction, initialState);
  return (
    <form action={action} className="editor-form" noValidate>
      {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
      <div className="form-field">
        <label htmlFor="title" className="form-field__label">Назва події</label>
        <input id="title" name="title" type="text" defaultValue={state.fields?.title} required aria-invalid={state.error && !state.fields?.title ? true : undefined} />
        <p className="form-field__hint">Наприклад: Марія & Віктор</p>
      </div>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="eventType" className="form-field__label">Тип події</label>
          <select id="eventType" name="eventType" defaultValue={state.fields?.eventType || "wedding"}>
            <option value="wedding">Весілля</option>
            <option value="birthday">День народження</option>
            <option value="corporate">Корпоратив</option>
            <option value="other">Інша подія</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="eventDate" className="form-field__label">Дата</label>
          <input id="eventDate" name="eventDate" type="date" defaultValue={state.fields?.eventDate} />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="clientName" className="form-field__label">Клієнти / герої події</label>
        <input id="clientName" name="clientName" type="text" defaultValue={state.fields?.clientName} />
      </div>
      <div className="form-field">
        <label htmlFor="location" className="form-field__label">Локація</label>
        <input id="location" name="location" type="text" defaultValue={state.fields?.location} />
      </div>
      <div className="form-actions">
        <a href="/dashboard" className="button button--neutral button--outline">Скасувати</a>
        <Button type="submit" busy={pending}>Створити подію</Button>
      </div>
    </form>
  );
}
