"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function ShareTools({ url, label = "Посилання на анкету", showQr = true }: { url: string; label?: string; showQr?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string>();

  useEffect(() => {
    if (!showQr) return;
    let active = true;
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: "#111111", light: "#F7FFB9" }, errorCorrectionLevel: "M" })
      .then((value) => { if (active) setQr(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [showQr, url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className={`share-tools ${showQr ? "" : "share-tools--compact"}`} aria-label={label}>
      {showQr ? <div className="share-tools__qr">{qr ? <Image src={qr} alt={`QR-код: ${label}`} width={240} height={240} unoptimized /> : <span>QR готується…</span>}</div> : null}
      <div className="share-tools__content">
        <span className="eyebrow">SHARE / PRIVATE LINK</span>
        <code>{url}</code>
        <div className="inline-actions">
          <button type="button" className="button button--neutral button--outline" onClick={copy}>{copied ? "Скопійовано ✓" : "Копіювати"}</button>
          <a className="button button--neutral button--outline" href={url} target="_blank" rel="noreferrer">Відкрити ↗</a>
          {showQr && qr ? <a className="button button--neutral button--outline" href={qr} download="tyama-questionnaire-qr.png">Завантажити QR</a> : null}
        </div>
        <p>Це приватне capability-посилання. Надсилайте лише учасникам події; не публікуйте у відкритих каналах.</p>
      </div>
      <span className="share-tools__status" role="status" aria-live="polite">{copied ? "Посилання скопійовано" : ""}</span>
    </section>
  );
}
