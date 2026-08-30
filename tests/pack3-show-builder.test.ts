import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260830183000_pack_3_show_builder_mobile_live.sql", "utf8");
const page = readFileSync("src/app/events/[eventId]/[section]/page.tsx", "utf8");
const mobile = readFileSync("src/components/mobile-live-console.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");

test("PACK 3 pins immutable Show Set revisions and snapshots", () => {
  assert.match(migration,/show_set_revisions/);
  assert.match(migration,/snapshot_hash/);
  assert.match(migration,/show_set_revision_id/);
});

test("rehearsal owns private state and cannot replace an active session", () => {
  assert.match(migration,/create table public\.rehearsal_state/);
  assert.match(migration,/active_session/);
  assert.doesNotMatch(migration,/update public\.live_sessions\s+set status = 'ended'/);
});

test("runtime actions are expected-version and idempotency bound", () => {
  assert.match(migration,/runtime_version<>p_expected_version/);
  assert.match(migration,/show_runtime_receipts/);
  assert.match(migration,/undo_unavailable/);
});

test("Show Builder and mobile Live routes use the canonical surfaces", () => {
  assert.match(page,/section === "show-builder"/);
  assert.match(page,/MobileLiveConsole/);
  assert.match(mobile,/Показати питання/);
  assert.match(mobile,/Аварійна заставка/);
  assert.match(css,/\.mobile-live__primary button \{ min-height: 72px/);
});
