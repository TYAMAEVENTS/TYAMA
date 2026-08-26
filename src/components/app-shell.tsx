import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";
import { logoutAction } from "@/app/actions/auth";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/dashboard" className="app-header__brand" aria-label="ТЯМА — події">
          <BrandMark compact />
        </Link>
        <div className="app-header__statement">РОЗРІЗНЕНЕ<br />СТАЄ ЗРОЗУМІЛИМ</div>
        <form action={logoutAction}>
          <button className="text-action" type="submit">Вийти</button>
        </form>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
