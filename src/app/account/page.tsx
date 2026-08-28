import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getAccessToken, requireUser } from "@/lib/auth/session";
import { supabaseRest } from "@/lib/supabase/rest";
import { PasswordForm, ProfileForm } from "./account-forms";

export const metadata: Metadata = { title: "Акаунт" };
type Profile = { display_name: string; is_active: boolean };

export default async function AccountPage() {
  const user = await requireUser();
  const accessToken = await getAccessToken();
  const profiles = accessToken ? await supabaseRest<Profile[]>(`profiles?select=display_name,is_active&id=eq.${encodeURIComponent(user.id)}&limit=1`, { accessToken }) : [];
  const profile = profiles[0];
  return <AppShell>
    <nav aria-label="Навігаційний шлях" className="breadcrumbs"><Link href="/dashboard">Події</Link><span>/</span><span aria-current="page">Акаунт</span></nav>
    <div className="page-heading"><div><span className="eyebrow">HOST / ACCOUNT</span><h1>Акаунт</h1><p>{user.email} · {profile?.is_active === false ? "доступ призупинено" : "активний окремий кабінет"}</p></div></div>
    <section className="account-grid"><article className="editor-panel"><span className="eyebrow">PROFILE</span><h2>Як вас називати</h2><ProfileForm displayName={profile?.display_name ?? user.email?.split("@")[0] ?? ""} /></article><article className="editor-panel"><span className="eyebrow">SECURITY</span><h2>Новий пароль</h2><p>Зміна стосується лише цього акаунта. Інший ведучий не отримає доступу до ваших подій.</p><PasswordForm /></article></section>
  </AppShell>;
}
