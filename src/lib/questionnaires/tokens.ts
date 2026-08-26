import "server-only";
import { createHash, createHmac } from "node:crypto";

function tokenPepper(): string {
  const value = process.env.TYAMA_TOKEN_PEPPER ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!value || value.length < 32) {
    throw new Error("TYAMA_TOKEN_PEPPER must contain at least 32 characters.");
  }
  return value;
}

export function questionnaireToken(questionnaireId: string): string {
  return createHmac("sha256", tokenPepper())
    .update(`questionnaire:${questionnaireId}`)
    .digest("base64url");
}

export function capabilityHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function publicQuestionnaireUrl(questionnaireId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${baseUrl.replace(/\/$/, "")}/q/${questionnaireToken(questionnaireId)}`;
}

export function publicScreenToken(eventId: string): string {
  return createHmac("sha256", tokenPepper())
    .update(`public-screen:${eventId}`)
    .digest("base64url");
}

export function publicScreenUrl(eventId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${baseUrl.replace(/\/$/, "")}/screen/${publicScreenToken(eventId)}`;
}
