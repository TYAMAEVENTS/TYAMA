"use client";

import { useEffect, useState } from "react";
import type { PublicScreenState } from "@/lib/live/types";

export function PublicScreen({ initialState, token }: { initialState: PublicScreenState; token: string }) {
  const [state, setState] = useState(initialState);
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/public-screen/${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Screen unavailable");
        const next = (await response.json()) as PublicScreenState;
        if (active) {
          setState((current) => next.revision >= current.revision ? next : current);
          setConnected(true);
        }
      } catch {
        if (active) setConnected(false);
      }
    };
    const timer = window.setInterval(poll, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, [token]);

  const payload = state.public_payload;
  const cleared = state.mode === "idle" || state.mode === "clear" || payload.kind === "clear";
  return (
    <main className={`screen-page screen-page--${state.mode}`}>
      <header className="screen-header"><span>ТЯМА / LIVE CONTEXT</span><span>{payload.session_mode === "rehearsal" ? "РЕПЕТИЦІЯ" : state.event_title}</span></header>
      <section className="screen-stage" aria-live="polite">
        {cleared ? <div className="screen-idle"><span className="screen-idle__signal" /><h1>ТЯМА</h1><p>Контекст уже збирається.</p></div> : <div className="screen-content"><span className="eyebrow">{payload.item_type || state.mode}</span>{payload.title ? <h1>{payload.title}</h1> : null}{payload.content ? <p>{payload.content}</p> : null}</div>}
      </section>
      <footer className="screen-footer"><span>REV {String(state.revision).padStart(3, "0")}</span><span>{connected ? "SIGNAL OK" : "LAST KNOWN STATE"}</span></footer>
    </main>
  );
}
