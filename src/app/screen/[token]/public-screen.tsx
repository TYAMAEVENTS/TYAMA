"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import type { PublicScreenState } from "@/lib/live/types";
import { mediaForCurrentAsset, type BoundPublicMedia, type PublicMedia } from "@/lib/live/media-state";

type BoardSlot = { index?: number; revealed?: boolean; label?: string; points?: number };

function StructuredContent({ state, token }: { state: PublicScreenState; token: string }) {
  const payload = state.public_payload;
  const data = payload.data ?? {};
  const kind = String(data.interactive_kind ?? "");
  const [media, setMedia] = useState<BoundPublicMedia | null>(null);
  const [previousMedia, setPreviousMedia] = useState<BoundPublicMedia | null>(null);
  const assetIds = Array.isArray(data.asset_ids) ? data.asset_ids.map(String) : [];
  const mediaIndex = Math.max(0, Number(data.slide_number ?? 1) - 1);
  const assetId = assetIds[0];
  const currentMedia = mediaForCurrentAsset(media, assetId);

  useEffect(() => {
    let active = true;
    if (!(["slideshow", "who_said"].includes(kind)) || !assetId) return;
    fetch(`/api/public-screen/${encodeURIComponent(token)}/media/${encodeURIComponent(assetId)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((next: PublicMedia) => { if (active) setMedia((current) => { if (kind === "slideshow" && current && current.assetId !== assetId) setPreviousMedia(current); if (kind === "who_said") setPreviousMedia(null); return { ...next, assetId }; }); })
      .catch(() => { if (active) setMedia((current) => current?.assetId === assetId ? null : current); });
    return () => { active = false; };
  }, [assetId, kind, token, state.revision]);

  if (data.stage === "intro") {
    const intro = kind === "family_feud"
      ? { number: "100 / 1", title: "100 до 1", copy: "Що найчастіше відповідали гості?" }
      : kind === "who_said"
        ? { number: "ХТО?", title: "Хто це сказав?", copy: "Фраза вже є. Чи вгадаєте автора?" }
        : kind === "dilettantes"
          ? { number: "± 1", title: "Клуб дилетантів", copy: "Правильна відповідь — число. Найближчий перемагає." }
          : { number: "▶▶", title: "Слайдшоу гостей", copy: "Фото й відео, які вже стали частиною цієї події." };
    if (kind === "dilettantes") return <div className="interactive-cover interactive-cover--art"><Image className="interactive-cover__art" src="/interactive-covers/dilettantes-v1.webp" alt="" fill priority sizes="100vw" /><h1 className="visually-hidden">Клуб дилетантів</h1><div className="interactive-cover__ready interactive-cover__ready--overlay"><i />Готуйтеся</div></div>;
    return <div className={`interactive-cover interactive-cover--${kind || "slideshow"}`}><div className="interactive-cover__signal">{intro.number}</div><span className="eyebrow">НАСТУПНИЙ ІНТЕРАКТИВ</span><h1>{intro.title}</h1><p>{intro.copy}</p><div className="interactive-cover__ready"><i />Готуйтеся</div></div>;
  }

  if (kind === "family_feud") {
    const slots = (Array.isArray(data.slots) ? data.slots : []) as BoardSlot[];
    const bonus = data.public_bonus && typeof data.public_bonus === "object" ? data.public_bonus as { label?: string; author?: string } : null;
    return <div className="screen-content screen-content--board"><span className="eyebrow">100 ЗІ 100 / ВІДПОВІДІ ГОСТЕЙ</span><h1>{String(data.prompt ?? payload.title ?? "100 зі 100")}</h1><ol className="family-board">{slots.map((slot, index) => <li className={slot.revealed ? "is-revealed" : ""} key={slot.index ?? index}><span>{index + 1}</span><strong>{slot.revealed ? slot.label : "••••••••"}</strong><b>{slot.revealed ? slot.points : "?"}</b></li>)}</ol>{bonus?.label ? <aside className="family-gem"><span>ГОСТІ ТАКОЖ СКАЗАЛИ</span><blockquote>«{bonus.label}»</blockquote>{bonus.author ? <strong>{bonus.author}</strong> : <small>Хто це міг сказати?</small>}</aside> : null}</div>;
  }
  if (kind === "who_said") {
    const revealed = Boolean(data.revealed);
    return <div className="screen-content screen-content--quote"><span className="eyebrow">ХТО ЦЕ СКАЗАВ?</span><blockquote>«{String(data.quote ?? payload.content ?? "")}»</blockquote>{revealed ? <div className="quote-author">{currentMedia ? <img src={currentMedia.url} alt="Автор відповіді" /> : null}<span>ПРАВИЛЬНА ВІДПОВІДЬ</span><strong>{String(data.author ?? "Гість")}</strong></div> : <p>Хто міг це написати?</p>}</div>; // eslint-disable-line @next/next/no-img-element
  }
  if (kind === "dilettantes") {
    if (data.stage === "wheel") {
      const wheelStyle = { "--wheel-rotation": "1080deg", "--wheel-counter-rotation": "-1080deg" } as CSSProperties;
      return <div className="screen-content screen-content--wheel"><span className="eyebrow">КОЛЕСО ЛЕГКИХ ЗАВДАНЬ</span><div className="fortune-layout"><div className="fortune-wheel" style={wheelStyle}><span>ТЯМА</span></div><div className="fortune-result"><span>ВИПАЛО</span><strong>{String(data.wheel_selected ?? "Завдання від ведучого")}</strong></div></div></div>;
    }
    const revealed = Boolean(data.revealed);
    return <div className="screen-content screen-content--number"><span className="eyebrow">КЛУБ ДИЛЕТАНТІВ</span><h1>{payload.title}</h1><p>{payload.content}</p>{revealed ? <div className="number-answer"><span>ПРАВИЛЬНА ВІДПОВІДЬ</span><strong>{String(data.correct_answer ?? "—")} {String(data.unit ?? "")}</strong>{data.consequence ? <small>Найдальша відповідь: {String(data.consequence)}</small> : null}</div> : <div className="number-wait">Напишіть свою версію числа</div>}</div>;
  }
  if (kind === "slideshow") {
    const shown = assetId ? currentMedia ?? previousMedia : null;
    return <div className="screen-content screen-content--slideshow"><span className="eyebrow">СЛАЙДШОУ / {mediaIndex + 1} З {Number(data.slide_count ?? 0)}</span>{!shown ? <div className="media-loading">Завантажуємо файл…</div> : shown.kind === "video" ? <video key={shown.url} src={shown.url} autoPlay controls playsInline /> : shown.kind === "audio" ? <audio key={shown.url} src={shown.url} autoPlay controls /> : <div className="slideshow-frame" key={shown.url}><img className="slideshow-frame__backdrop" src={shown.url} alt="" aria-hidden="true" /><img className="slideshow-frame__image" src={shown.url} alt="Фото гостя для слайдшоу" /></div>}</div>; // eslint-disable-line @next/next/no-img-element
  }
  return <div className="screen-content screen-content--blocked"><span className="eyebrow">ТЯМА / LIVE</span><h1>Оберіть інтерактив</h1><p>Сирі відповіді гостей не показуються на екрані.</p></div>;
}

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
    const timer = window.setInterval(poll, 750);
    return () => { active = false; window.clearInterval(timer); };
  }, [token]);

  const payload = state.public_payload;
  const cleared = state.mode === "idle" || state.mode === "clear" || payload.kind === "clear";
  return (
    <main className={`screen-page screen-page--${state.mode}`}>
      <header className="screen-header"><span>ТЯМА / LIVE CONTEXT</span><span>{payload.session_mode === "rehearsal" ? "РЕПЕТИЦІЯ" : state.event_title}</span></header>
      <section className="screen-stage" aria-live="polite">
        {cleared ? <div className="screen-idle"><span className="screen-idle__signal" /><h1>ТЯМА</h1><p>Контекст уже збирається.</p></div> : <StructuredContent state={state} token={token} />}
      </section>
      <footer className="screen-footer"><span>REV {String(state.revision).padStart(3, "0")}</span><span>{connected ? "SIGNAL OK" : "LAST KNOWN STATE"}</span></footer>
    </main>
  );
}
