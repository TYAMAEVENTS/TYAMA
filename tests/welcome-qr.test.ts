import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node 22 strip-types test intentionally imports the TypeScript source directly.
import { buildWelcomeQrPayload } from "../src/lib/live/welcome.ts";

test("welcome payload contains only audience-safe display data", () => {
  const payload = buildWelcomeQrPayload({
    headline: "ЮЛЯ, НЕ ЧИТАЙ!",
    body: "Безпечний текст для гостей",
    cta: "СКАНУЙ. 4 ХВИЛИНИ.",
    footer: "Поки що.",
    questionnaireUrl: "https://tyama.vercel.app/q/public-capability-token",
    heroAssetId: "00000000-0000-4000-8000-000000000001",
  }, "rehearsal");
  assert.equal(payload.kind, "welcome_qr");
  assert.equal(payload.data?.questionnaire_url, "https://tyama.vercel.app/q/public-capability-token");
  assert.equal(payload.data?.hero_asset_id, "00000000-0000-4000-8000-000000000001");
  const serialized = JSON.stringify(payload);
  for (const forbidden of ["host_id", "respondent", "submission", "answer_id", "session_id", "email", "phone"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("welcome copy is bounded and empty values receive safe defaults", () => {
  const payload = buildWelcomeQrPayload({ headline: " ", body: "x".repeat(600), cta: " ", footer: " ", questionnaireUrl: "https://example.test/q/token" }, "live");
  assert.equal(payload.data?.headline, "ЛАСКАВО ПРОСИМО!");
  assert.equal(String(payload.data?.body).length, 420);
  assert.equal(payload.data?.cta, "СКАНУЙ. 4 ХВИЛИНИ.");
  assert.equal(payload.session_mode, "live");
});
