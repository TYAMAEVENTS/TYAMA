"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { showEventKitItemAction } from "@/app/actions/live";

type Candidate = { id: string; title: string };

export function LiveAutoplay({ eventId, candidates }: { eventId: string; candidates: Candidate[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [intervalSeconds, setIntervalSeconds] = useState(20);
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

  useEffect(() => {
    if (!running || candidates.length < 2) return;
    const timer = window.setInterval(() => {
      showCandidate((currentIndexRef.current + 1) % candidates.length);
    }, intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [candidates.length, intervalSeconds, running, showCandidate]);

  function start() {
    if (candidates.length < 2) return;
    showCandidate(currentIndexRef.current % candidates.length);
    setRunning(true);
  }

  function stop() {
    setRunning(false);
  }

  return (
    <section className="live-autoplay" aria-label="Автопоказ блоків">
      <div><span className="eyebrow">AUTO SLIDESHOW</span><h3>Автопоказ</h3><p>Цикл містить лише схвалені public-блоки. Закриття цієї консолі зупиняє автопоказ.</p></div>
      <label><span>Інтервал</span><select value={intervalSeconds} onChange={(event) => setIntervalSeconds(Number(event.currentTarget.value))} disabled={running}><option value={10}>10 секунд</option><option value={20}>20 секунд</option><option value={30}>30 секунд</option></select></label>
      <div className="inline-actions">
        <button className="button button--brand button--solid" type="button" onClick={start} disabled={running || pending || candidates.length < 2}>{pending && !running ? "Запускаємо…" : "Почати автопоказ"}</button>
        <button className="button button--neutral button--outline" type="button" onClick={stop} disabled={!running}>Зупинити</button>
      </div>
      <p className="status">{running ? `У циклі: ${candidates[currentIndex]?.title || "блок"}. Наступний через ${intervalSeconds} с.` : candidates.length >= 2 ? `Готово блоків у циклі: ${candidates.length}.` : candidates.length === 1 ? "Для автопоказу потрібно щонайменше 2 public-блоки." : "Немає блоків, дозволених для Public Screen."}</p>
    </section>
  );
}
