import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFamilyFeudAnalyses,
  replaceFamilyFeudBoardSlot,
  revealFamilyFeudAnswerAt,
  revealNextFamilyFeudAnswer,
// @ts-expect-error Node 22 strip-types test intentionally imports TypeScript source directly.
} from "../src/lib/event-kit/family-feud.ts";
import {
  buildWhoSaidCandidates,
  hideWhoSaidAuthor,
  revealWhoSaidCandidate,
// @ts-expect-error Node 22 strip-types test intentionally imports TypeScript source directly.
} from "../src/lib/event-kit/who-said.ts";

type EventSubmission = Parameters<typeof buildFamilyFeudAnalyses>[0][number];

function answer(id: string, prompt: string, value: string, settings: Record<string, unknown>, media: EventSubmission["answers"][number]["media_assets"] = []) {
  return { id, answer_text: value, answer_json: null, privacy_status: "public_allowed" as const, moderation_status: "approved" as const, is_useful: true, do_not_use: false, question: { id: `q-${id}`, prompt, type: media.length ? "media" as const : "short_text" as const, settings }, media_assets: media };
}

function submission(id: string, answers: EventSubmission["answers"], name = `QA ${id}`): EventSubmission {
  return { id: `s-${id}`, status: "submitted", submitted_at: "2026-08-29T00:00:00Z", created_at: "2026-08-29T00:00:00Z", respondent: { display_name: name, relationship_label: null }, questionnaire: { title: "QA", audience: "guest" }, answers };
}

test("Who Said chooses priority quote and selfie from the same submission", () => {
  const records = [
    submission("1", [
      answer("fallback-1", "Fallback", "Завжди допомагає", { content_intents: ["who_said"], who_said_priority: 20 }),
      answer("priority-1", "Priority", "Людина, яка запалює всіх", { content_intents: ["who_said"], who_said_priority: 10 }),
      answer("selfie-1", "Селфі", "", { content_intents: ["media"], who_said_role: "selfie" }, [{ id: "media-1", kind: "image", mime_type: "image/webp", original_filename: "qa.webp", size_bytes: 100, status: "ready", privacy_status: "public_allowed", moderation_status: "approved" }]),
    ], "QA Guest 01"),
    submission("2", [answer("priority-2", "Priority", "Інша фраза", { content_intents: ["who_said"], who_said_priority: 10 }), answer("selfie-2", "Селфі", "", { content_intents: ["media"], who_said_role: "selfie" }, [{ id: "media-2", kind: "image", mime_type: "image/webp", original_filename: "qa.webp", size_bytes: 100, status: "ready", privacy_status: "public_allowed", moderation_status: "approved" }])], "QA Guest 02"),
  ];
  const candidates = buildWhoSaidCandidates(records);
  assert.deepEqual(candidates[0], { submissionId: "s-1", answerId: "priority-1", quote: "Людина, яка запалює всіх", author: "QA Guest 01", selfieAssetId: "media-1" });
  assert.equal(candidates[1].selfieAssetId, "media-2");
});

test("Who Said keeps quote without selfie and reveals identity only explicitly", () => {
  const candidate = buildWhoSaidCandidates([submission("3", [answer("quote-3", "Quote", "Тепла і дуже смілива", { content_intents: ["who_said"], who_said_priority: 1 })], "QA Guest 03")])[0];
  assert.equal(candidate.selfieAssetId, null);
  const hidden = hideWhoSaidAuthor({ interactive_kind: "who_said", quote: candidate.quote, author: "leak", asset_ids: ["leak"] });
  assert.equal("author" in hidden, false);
  assert.equal("asset_ids" in hidden, false);
  const revealed = revealWhoSaidCandidate(hidden, candidate);
  assert.equal(revealed.author, "QA Guest 03");
  assert.deepEqual(revealed.asset_ids, []);
});

test("Family Feud v4 creates six positions and selectively reveals only requested row", () => {
  const records = ["А", "Б", "В", "Г", "Д", "Е", "Ж"].map((value, index) => submission(String(index), [answer(`ff-${index}`, "Питання", `${value} відповідь`, { content_intents: ["family_feud"] })]));
  const analysis = buildFamilyFeudAnalyses(records)[0];
  assert.equal(analysis.top.length, 6);
  assert.equal(analysis.groups.length, 7);
  const data = { generator: "family_feud_v4", answers: analysis.top.map((group) => ({ label: group.label, points: group.points })), revealed_indexes: [] };
  const revealed = revealFamilyFeudAnswerAt(data, 3);
  assert.deepEqual(revealed.revealed_indexes, [3]);
  const replaced = replaceFamilyFeudBoardSlot(revealed, 0, analysis.groups[6]);
  assert.equal((replaced.answers as Array<{ label: string }>)[0].label, analysis.groups[6].label);
  assert.deepEqual(replaced.revealed_indexes, [3]);
});

test("legacy Family Feud retains sequential reveal", () => {
  const legacy = { generator: "family_feud_v3", answers: [{ label: "A", points: 2 }], revealed_count: 0 };
  assert.equal(revealNextFamilyFeudAnswer(legacy).revealed_count, 1);
});
