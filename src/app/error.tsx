"use client";

import { useEffect } from "react";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { document.title = "Помилка — ТЯМА"; }, []);
  return <main className="route-state"><span className="route-state__code">500</span><h1>Щось не зійшлося.</h1><p>Дані не стерті. Оновіть цей екран або спробуйте ще раз.</p><button className="button button--brand button--solid" type="button" onClick={reset}>Спробувати ще раз</button></main>;
}
