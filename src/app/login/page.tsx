import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = { title: "Вхід" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="login-page">
      <header className="poster-masthead">
        <span>01 / ЗБІГЛОСЯ</span>
        <span className="poster-masthead__right">РОЗРІЗНЕНЕ<br />СТАЄ ЗРОЗУМІЛИМ</span>
      </header>
      <section className="login-hero">
        <BrandMark />
        <div className="login-hero__index"><span />ЛЮДИ<br />ФАКТИ<br />ЖАРТИ<br />МЕДІА</div>
      </section>
      <section className="login-grid">
        <div className="login-grid__brand">
          <span className="eyebrow">TYAMA / HOST ACCESS</span>
          <h1>Ваш простір.<br />Усе на місці.</h1>
        </div>
        <div className="login-grid__form">
          <span className="eyebrow">ВХІД ДО РОБОЧОГО ПРОСТОРУ</span>
          <p>Ваші події, анкети, контекст і Live Mode — в одному місці.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
