"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceSlideshowAction, showEventKitItemAction } from "@/app/actions/live";

type Candidate = { id: string; title: string };

export function LiveAutoplay({ eventId, candidates }: { eventId: string; candidates: Candidate[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(5);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const currentIndexRef = useRef(0);
  const inFlightRef = useRef(false);

  const showCandidate = useCallback((index: number) => {
    const candidate = candidates[index];
    if (!candidate || inFlightRef.current) return;
    currentIndexRef.current = index;
    setCurrentIndex(index);
    inFlightRef.current = true;
    startTransition(async () => {
      try {
        await showEventKitItemAction(eventId, candidate.id);
        router.refresh();
      } finally {
        inFlightRef.current = false;
      }
    });
  }, [candidates, eventId, router]);

  const advance = useCallback(() => {
    const candidate = candidates[currentIndexRef.current];
    if (!candidate || inFlightRef.current) return;
    inFlightRef.current = true;
    startTransition(async () => {
      try { await advanceSlideshowAction(eventId, candidate.id); router.refresh(); }
      finally { inFlightRef.current = false; }
    });
  }, [candidates, eventId, router]);

  useEffect(() => {
    if (!running || candidates.length < 1) return;
    const timer = window.setInterval(() => {
      if (candidates.length === 1) advance();
      else showCandidate((currentIndexRef.current + 1) % candidates.length);
    }, intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [advance, candidates.length, intervalSeconds, running, showCandidate]);

  function start() {
    if (candidates.length < 1) return;
    showCandidate(currentIndexRef.current % candidates.length);
    setRunning(true);
  }

  function stop() {
    setRunning(false);
  }

  return (
    <section className="live-autoplay" aria-label="Автопоказ блоків">
      <div><span className="eyebrow">АВТОПОКАЗ</span><h3>Слайдшоу</h3><p>Наступний файл відкривається автоматично. Закриття цієї консолі зупиняє автопоказ.</p></div>
      <label><span>Інтервал</span><select value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.currentTarget.value))} disabled={running}><option value={4}>4 секунди</option><option value={5}>5 секунд</option><option value={8}>8 секунд</option></select></label>
      <div className="inline-actions">
        <button className="button button--brand button--solid" type="button" onClick={start} disabled={running || pending || candidates.length < 1}>{pending && !running ? "Запускаємо…" : "Почати автопоказ"}</button>
        <button className="button button--neutral button--outline" type="button" onClick={stop} disabled={!running}>Зупинити</button>
      </div>
      <p className="status">{running ? `Зараз: ${candidates[currentIndex]?.title || "слайдшоу"}. Наступний файл через ${intervalSeconds} с.` : candidates.length ? `Готово слайдшоу: ${candidates.length}.` : "Немає слайдшоу, дозволених для екрана."}</p>
    </section>
  );
}
