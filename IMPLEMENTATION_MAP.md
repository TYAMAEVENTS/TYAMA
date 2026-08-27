# Internal Implementation Map

Source: `TYAMA_PILOT_SVIAT_HANDOFF_v3`, with legacy-repository requirements explicitly cancelled by the owner on 2026-08-26.

## P0 vertical slices

1. Auth: manual Supabase user, login/logout, durable cookie session, no signup.
2. Host Dashboard: own Events, status/date/type/client, submission count.
3. Event Workspace: overview and route-backed sections.
4. Questionnaires: customer/guest, editable ordered questions, publish/close, opaque public tokens, copy/QR.
5. Public submissions: mobile-first, no login, idempotent final submit, server-derived ownership.
6. Responses: raw answers and private media remain available without AI.
7. Privacy/moderation: host_only/review_required/public_allowed plus pending/approved/rejected.
8. Event Kit: persistent manual and AI items; manual path always available.
9. Rehearsal and Live: explicit sessions, stable controls, canonical persisted live state.
10. Public Screen: opaque token, sanitized payload only, last-known state plus fallback polling.
11. Backup: responses CSV, event snapshot JSON, printable Event Kit, live-critical media downloads.
12. Media: private bucket and signed upload/read flows; enable only QA-passed types.

## Routes

- `/login`
- `/dashboard`
- `/events/new`
- `/events/[eventId]`
- `/events/[eventId]/questionnaires`
- `/events/[eventId]/responses`
- `/events/[eventId]/event-kit`
- `/events/[eventId]/rehearsal`
- `/events/[eventId]/live`
- `/events/[eventId]/backup`
- `/q/[token]`
- `/screen/[token]`
- `/api/public-screen/[token]`
- Supabase Edge Function: `public-api` (`get_questionnaire`, `submit_questionnaire`, `prepare_media_upload`, `complete_media_upload`, `get_public_screen`)

## Data boundary

Canonical entities: profiles, events, questionnaires, questions, respondents, submissions, answers, media_assets, event_kit_items, live_sessions, live_state. Every Event child carries `host_id` and `event_id`; composite foreign keys prevent cross-Event references. All exposed tables have RLS. `anon` has no generic application-table CRUD.

## Release gate

The Pilot is not ready until all P0 checks and the 20-step E2E acceptance flow pass, including Event A/B isolation, mobile form, separate Public Screen browser, AI failure, realtime interruption, exports, and local backup.

## Implementation checkpoint — 2026-08-26

Implemented and production-building: Auth shell, Host Dashboard, Event creation/workspace, questionnaire CRUD/order/publish/close, transactional public submission, raw responses, moderation/privacy, manual Event Kit fallback, Rehearsal/Live sessions, sanitized Public Screen with polling fallback, CSV/JSON/print backup.

Infrastructure applied: clean Supabase project, canonical migrations, 11 RLS-enabled application tables, private Storage bucket, and active `public-api` Edge Function. Security advisor has one Auth-level warning: leaked-password protection is disabled.

Media v1 implemented on 2026-08-27: questionnaire-level image/video/audio switches, capability-scoped signed uploads, private host preview/download, per-asset moderation, and Event Kit linkage. Public Screen never receives media automatically.

Production Media v1 image QA passed on 2026-08-27 with one owner-approved synthetic submission: private upload and completion, owner-only signed preview/download, moderation refresh, duplicate-safe Event Kit linkage, Event Kit/Live privacy exclusion, foreign-user RLS isolation, and CSV/JSON/print backup. The asset remains `host_only + approved`; unauthenticated media read returns `401`. Physical mobile-device QA and real video/audio samples remain release gates.

Smart Draft production QA passed on 2026-08-27: one host action creates separate context, story, interactive-preparation, and host-cheatsheet blocks from usable raw answers. Every generated item starts as `draft + host_only`, records source references, and has a stable generator key. Repeated runs create no duplicates. Identity/contact prompts are excluded from survey games; insufficient data produces an honest collection plan instead of invented scores.

Live session transitions became transactional on 2026-08-27. `rehearsal → live → end` now updates the Event, active session, and canonical live state in one RLS-respecting `SECURITY INVOKER` RPC. A rollback acceptance test confirmed exactly one active session through switches, matching live-state foreign keys, clean end state, and denial for a foreign authenticated UUID.

Live Auto Slideshow was added on 2026-08-27: the host can start/stop a 10/20/30-second cycle from the Live console. The client receives only the already-filtered `approved + public_allowed` candidate IDs, serializes server actions to prevent overlapping transitions, and stops when the console closes. Manual show controls remain available.

External release gates: enable Supabase leaked-password protection, finish Media v1 physical mobile/video/audio QA, perform the final logged-in UI click-through for transactional Live and Auto Slideshow, and complete the remaining pilot acceptance checks. The Host Auth user, GitHub remote, production alias, Smart Draft flow, image upload/read/privacy QA, exports, transactional Live data boundary, and core two-Event isolation checks are complete.
