import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import { EventForm } from "@/app/events/new/event-form";

export const metadata: Metadata = { title: "Нова подія" };

export default async function NewEventPage() {
  await requireUser();
  return (
    <AppShell>
      <div className="page-heading page-heading--editor">
        <div>
          <span className="eyebrow">EVENT / NEW</span>
          <h1>Нова подія</h1>
          <p>Спочатку — рамка. Контекст зберемо далі.</p>
        </div>
      </div>
      <section className="editor-panel"><EventForm /></section>
    </AppShell>
  );
}
