import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePublicPresentation } from "../supabase/functions/public-api/public-presentation.ts";

const payload = (kind: string, data: Record<string, unknown>, item_type = "interactive") => ({
  item_type, title: "Public title", content: "Public content", session_mode: "live", data: { interactive_kind: kind, ...data },
  source_refs: [{ id: "secret" }], generator_key: "secret",
});

test("family feud publishes shape-only hidden slots and only selected reveals", () => {
  const hidden = sanitizePublicPresentation(payload("family_feud", { stage: "question", generator: "family_feud_v4", answers: [{ label: "Hidden A", points: 5 }, { label: "Hidden B", points: 3 }], originals: ["secret"], revealed_indexes: [] }));
  assert.deepEqual((hidden.data as Record<string, unknown>).slots, [{ index: 0, revealed: false }, { index: 1, revealed: false }]);
  const revealed = sanitizePublicPresentation(payload("family_feud", { stage: "reveal", generator: "family_feud_v4", answers: [{ label: "Shown", points: 5 }, { label: "Hidden B", points: 3 }], revealed_indexes: [0] }));
  assert.deepEqual((revealed.data as Record<string, unknown>).slots, [{ index: 0, revealed: true, label: "Shown", points: 5 }, { index: 1, revealed: false }]);
});

test("dilettantes keeps answer server-side until reveal", () => {
  const hidden = sanitizePublicPresentation(payload("dilettantes", { stage: "question", revealed: false, correct_answer: 42, unit: "роки", config: "secret" }));
  assert.equal("correct_answer" in (hidden.data as Record<string, unknown>), false);
  const revealed = sanitizePublicPresentation(payload("dilettantes", { stage: "reveal", revealed: true, correct_answer: 42, unit: "роки", config: "secret" }));
  assert.deepEqual(revealed.data, { interactive_kind: "dilettantes", stage: "reveal", revealed: true, correct_answer: 42, unit: "роки" });
});

test("who said publishes quote only, then one matching selfie reference", () => {
  const hidden = sanitizePublicPresentation(payload("who_said", { stage: "question", revealed: false, quote: "Quote", author: "Hidden", asset_ids: ["selfie", "other"] }));
  assert.deepEqual(hidden.data, { interactive_kind: "who_said", stage: "question", revealed: false, quote: "Quote" });
  const revealed = sanitizePublicPresentation(payload("who_said", { stage: "reveal", revealed: true, quote: "Quote", author: "Author", asset_ids: ["selfie", "other"] }));
  assert.deepEqual(revealed.data, { interactive_kind: "who_said", stage: "reveal", revealed: true, quote: "Quote", author: "Author", asset_ids: ["selfie"] });
});

test("slideshow publishes current asset only", () => {
  const result = sanitizePublicPresentation(payload("slideshow", { stage: "question", asset_ids: ["past", "current", "future"], current_index: 1 }, "media"));
  assert.deepEqual(result.data, { interactive_kind: "slideshow", stage: "question", slide_number: 2, slide_count: 3, asset_ids: ["current"] });
});

test("unknown presentation fails closed and forbidden metadata never survives", () => {
  const unknown = sanitizePublicPresentation(payload("future_game", { stage: "question", author: "Hidden", source_refs: ["secret"] }));
  assert.deepEqual(unknown, { kind: "clear", session_mode: "live" });
  const serialized = JSON.stringify(sanitizePublicPresentation(payload("who_said", { stage: "question", quote: "Safe", source_refs: ["secret"], generator_key: "secret", originals: ["secret"] })));
  for (const forbidden of ["source_refs", "generator_key", "originals", "secret"]) assert.equal(serialized.includes(forbidden), false);
});

