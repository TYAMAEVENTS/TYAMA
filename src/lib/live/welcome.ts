import type { PublicPayload } from "@/lib/live/types";

export type WelcomeQrConfig = {
  headline: string;
  body: string;
  cta: string;
  footer: string;
  questionnaireUrl: string;
  heroAssetId?: string;
};

function cleanCopy(value: string, fallback: string, maxLength: number): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return (cleaned || fallback).slice(0, maxLength);
}

export function buildWelcomeQrPayload(config: WelcomeQrConfig, sessionMode: "rehearsal" | "live"): PublicPayload {
  const data: Record<string, unknown> = {
    headline: cleanCopy(config.headline, "ЛАСКАВО ПРОСИМО!", 120),
    body: cleanCopy(config.body, "Допоможіть ведучому зібрати матеріал про цю подію.", 420),
    cta: cleanCopy(config.cta, "СКАНУЙ. 4 ХВИЛИНИ.", 80),
    footer: cleanCopy(config.footer, "Ваші відповіді вже скоро стануть частиною події.", 180),
    questionnaire_url: config.questionnaireUrl,
    display: { layout: "photo_qr_split_v1" },
  };
  if (config.heroAssetId) data.hero_asset_id = config.heroAssetId;
  return {
    kind: "welcome_qr",
    item_type: "welcome",
    title: data.headline as string,
    content: data.body as string,
    session_mode: sessionMode,
    data,
  };
}
