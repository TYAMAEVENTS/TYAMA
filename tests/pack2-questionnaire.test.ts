import assert from "node:assert/strict";
import test from "node:test";
import { customerPreset, GUEST_PRESET_ID, guestBalancedPreset } from "../src/lib/questionnaires/catalog.ts";

test("frozen guest preset has exact coverage and explicit Who Said pair", () => {
  assert.equal(GUEST_PRESET_ID, "guest_balanced_v1");
  for (const eventType of ["birthday", "wedding", "corporate", "other"] as const) {
    const preset = guestBalancedPreset(eventType);
    assert.equal(preset.length, 12);
    assert.ok(preset.filter((field) => field.settings.content_intents?.includes("family_feud")).length >= 4);
    assert.ok(preset.filter((field) => field.settings.content_intents?.includes("story")).length >= 2);
    const pair = preset.filter((field) => field.settings.module_key === "who_said.primary");
    assert.deepEqual(pair.map((field) => field.settings.who_said_role), ["quote", "selfie"]);
    assert.equal(pair[1].settings.media_role, "who_said_selfie");
    assert.equal(preset.at(-1)?.settings.public_source_policy, "host_only");
  }
});

test("wedding additions never enter other event presets", () => {
  for (const eventType of ["birthday", "corporate", "other"] as const) {
    assert.equal(customerPreset(eventType).some((field) => /одружитися|наречен|освідчення/.test(field.prompt)), false);
  }
  assert.equal(customerPreset("wedding").length, 18);
});

test("public serializer source contains an explicit allowlist and no internal settings spread", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../supabase/functions/public-api/index.ts", import.meta.url), "utf8"));
  const block = source.slice(source.indexOf('if (action === "get_questionnaire")'), source.indexOf('if (action === "begin_submission_draft")'));
  assert.match(block, /input_config/);
  assert.doesNotMatch(block, /questions:\s*questions\s*\?\?/);
  for (const forbidden of ["content_intents:", "semantic_key:", "module_key:", "template_id:", "source_refs:", "generator_key:"]) assert.equal(block.includes(forbidden), false);
});
