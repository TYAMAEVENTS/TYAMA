import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFamilyFeudAnalyses,
  hideFamilyFeudGem,
  revealFamilyFeudGemAuthor,
  revealNextFamilyFeudAnswer,
  showFamilyFeudGem,
// @ts-ignore Node 22 strip-types test intentionally imports the TypeScript source directly.
} from "../src/lib/event-kit/family-feud.ts";

type EventSubmission = Parameters<typeof buildFamilyFeudAnalyses>[0][number];

const prompt = "Що у Свята найсмішніше?";

function submission(id: string, value: string, respondent = `Гість ${id}`): EventSubmission {
  return {
    id: `submission-${id}`,
    status: "submitted",
    submitted_at: "2026-08-29T00:00:00Z",
    created_at: "2026-08-29T00:00:00Z",
    respondent: { display_name: respondent, relationship_label: null },
    questionnaire: { title: "QA", audience: "guest" },
    answers: [{
      id: `answer-${id}`,
      answer_text: value,
      answer_json: null,
      privacy_status: "public_allowed",
      moderation_status: "approved",
      is_useful: true,
      do_not_use: false,
      question: { prompt, type: "short_text" },
      media_assets: [],
    }],
  };
}

test("family_feud_v3 builds real TOP-4, preserves originals and keeps non-top Gems", () => {
  const records = [
    submission("1", "Запізнюється"),
    submission("2", "спізнюється"),
    submission("3", "Смішить усіх"),
    submission("4", "всіх смішить"),
    submission("5", "Допомагає"),
    submission("6", "Танцює до ранку"),
    submission("7", "Приїжджає тоді, коли всі вже перестали його чекати"),
    submission("8", "Замовляє всім ще один раунд"),
  ];
  const before = JSON.stringify(records);
  const analysis = buildFamilyFeudAnalyses(records)[0];
  assert.equal(analysis.lowPotential, false);
  assert.equal(analysis.top.length, 4);
  assert.equal(analysis.top.find((group) => group.key === "запізнюється")?.points, 2);
  assert.equal(analysis.top.find((group) => group.key === "смішить усіх")?.points, 2);
  assert.equal(analysis.groups.reduce((sum, group) => sum + group.points, 0), 8);
  assert.ok(analysis.gems.length >= 1);
  assert.equal(JSON.stringify(records), before);
});

test("low-potential and unsafe questions do not become valid boards", () => {
  const low = buildFamilyFeudAnalyses([
    submission("1", "Так"),
    submission("2", "Ні"),
    submission("3", "Можливо"),
    submission("4", "хуйня"),
  ])[0];
  assert.equal(low.lowPotential, true);
  assert.equal(low.usableCount, 3);
});

test("Gem stays private until SHOW and author stays private until explicit reveal", () => {
  const selectedOnly = { generator: "family_feud_v3", gem_visible: false, gem_author_visible: false };
  assert.equal("selected_gem" in selectedOnly, false);
  const shown = showFamilyFeudGem(selectedOnly, "Рідкісна сильна відповідь");
  assert.equal(shown.selected_gem, "Рідкісна сильна відповідь");
  assert.equal(shown.gem_visible, true);
  assert.equal("gem_author" in shown, false);
  const revealed = revealFamilyFeudGemAuthor(shown, "Рідкісна сильна відповідь", "Олена");
  assert.equal(revealed.gem_author_visible, true);
  assert.equal(revealed.gem_author, "Олена");
  const hidden = hideFamilyFeudGem(revealed);
  assert.equal("selected_gem" in hidden, false);
  assert.equal("gem_author" in hidden, false);
});

test("legacy v2 boards retain sequential reveal behavior", () => {
  const legacy = { generator: "interactive_builder_v2", interactive_kind: "family_feud", answers: [{ label: "A", points: 2 }, { label: "B", points: 1 }], revealed_count: 0 };
  const next = revealNextFamilyFeudAnswer(legacy);
  assert.equal(next.revealed_count, 1);
  assert.equal(next.stage, "reveal");
  assert.equal((next as Record<string, unknown>).answers, legacy.answers);
});
