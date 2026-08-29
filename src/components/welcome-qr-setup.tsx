"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { configureWelcomeQrAction, type WelcomeQrSetupState } from "@/app/actions/live";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status";

const initialState: WelcomeQrSetupState = {};

export function WelcomeQrSetup({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(configureWelcomeQrAction.bind(null, eventId), initialState);
  useEffect(() => { if (state.success) router.refresh(); }, [router, state.success]);
  return <form action={action} className="welcome-setup editor-form" noValidate>
    <span className="eyebrow">WELCOME / QR</span>
    <h3>Підготуйте заставку збору відповідей</h3>
    <div className="form-field"><label className="form-field__label" htmlFor="welcome-headline">Заголовок</label><input id="welcome-headline" name="headline" required /></div>
    <div className="form-field"><label className="form-field__label" htmlFor="welcome-body">Текст</label><textarea className="resize-none" id="welcome-body" name="body" required /></div>
    <div className="form-grid"><div className="form-field"><label className="form-field__label" htmlFor="welcome-cta">Біля QR</label><input id="welcome-cta" name="cta" defaultValue="СКАНУЙ. 4 ХВИЛИНИ." required /></div><div className="form-field"><label className="form-field__label" htmlFor="welcome-footer">Нижній рядок</label><input id="welcome-footer" name="footer" required /></div></div>
    <div className="form-field"><label className="form-field__label" htmlFor="welcome-hero">Фото героя</label><input id="welcome-hero" name="hero" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
    {state.error ? <StatusMessage tone="error">{state.error}</StatusMessage> : null}
    {state.success ? <StatusMessage tone="success">Заставку збережено. Тепер натисніть «Показати QR».</StatusMessage> : null}
    <Button type="submit" busy={pending}>Зберегти заставку</Button>
  </form>;
}
