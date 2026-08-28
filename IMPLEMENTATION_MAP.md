# Internal Implementation Map

## 2026-08-28 guest and host UX pass

- Guest questionnaires render one question per screen; optional questions have `Пропустити`, while customer questionnaires keep the full-form workflow.
- New guest questionnaires include an optional media step and enable image, video, and audio uploads. Migration `20260828120000_add_media_to_guest_questionnaires.sql` adds the same capability to existing guest questionnaires without duplicating media questions.
- Event workspace now starts with a three-step launchpad for guest QR, response review, and Event Kit/rehearsal readiness.
- Response triage is exception-based: clean public answers are preselected for interactive building, obvious profanity/insults wait for the Host, and private answers never enter the bulk builder.

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
- Supabase Edge Function: `public-api` (`get_questionnaire`, `submit_questionnaire`, `prepare_media_upload`, `complete_media_upload`, `get_public_screen`, `get_public_media`)

## Data boundary

Canonical entities: profiles, events, questionnaires, questions, respondents, submissions, answers, media_assets, event_kit_items, live_sessions, live_state. Every Event child carries `host_id` and `event_id`; composite foreign keys prevent cross-Event references. All exposed tables have RLS. `anon` has no generic application-table CRUD.

## Release gate

The Pilot is not ready until all P0 checks and the 20-step E2E acceptance flow pass, including Event A/B isolation, mobile form, separate Public Screen browser, AI failure, realtime interruption, exports, and local backup.

## Implementation checkpoint — 2026-08-26

Implemented and production-building: Auth shell, Host Dashboard, Event creation/workspace, questionnaire CRUD/order/publish/close, transactional public submission, raw responses, moderation/privacy, manual Event Kit fallback, Rehearsal/Live sessions, sanitized Public Screen with polling fallback, CSV/JSON/print backup.

Infrastructure applied: clean Supabase project, canonical migrations, 11 RLS-enabled application tables, private Storage bucket, and active `public-api` Edge Function. Security advisor has one Auth-level warning: leaked-password protection is disabled.

Media v1 implemented on 2026-08-27: questionnaire-level image/video/audio switches, capability-scoped signed uploads, private host preview/download, per-asset moderation, and Event Kit linkage. Public Screen never receives media automatically.

Media v1 enforces the handoff limits at both UI and Postgres boundaries: 10 files, 200 MB total per submission, and 10/25/100 MB per image/audio/video file. The database total is checked under the existing submission-scoped advisory lock, so concurrent prepare requests cannot bypass it.

Media retry state was hardened on 2026-08-27. The public uploader retains each prepared asset and signed upload across recoverable retries, and retries finalize without re-uploading when the object already reached Storage. This prevents the normal mobile retry button from creating duplicate pending assets after a short network interruption.

Production Media v1 image QA passed on 2026-08-27 with one owner-approved synthetic submission: private upload and completion, owner-only signed preview/download, moderation refresh, duplicate-safe Event Kit linkage, Event Kit/Live privacy exclusion, foreign-user RLS isolation, and CSV/JSON/print backup. The asset remains `host_only + approved`; unauthenticated media read returns `401`. Physical mobile-device QA and real video/audio samples remain release gates.

Smart Draft production QA passed on 2026-08-27: one host action creates separate context, story, interactive-preparation, and host-cheatsheet blocks from usable raw answers. Every generated item starts as `draft + host_only`, records source references, and has a stable generator key. Repeated runs create no duplicates. Identity/contact prompts are excluded from survey games; insufficient data produces an honest collection plan instead of invented scores.

Smart Draft provenance was made explicit on 2026-08-27: deterministic generated blocks use `source_type=rules`, not `ai`. Existing Smart Draft v1 rows were migrated narrowly by generator metadata. Real AI remains a separate optional server-side path and is not claimed as configured while production has no OpenAI key.

Live session transitions became transactional on 2026-08-27. `rehearsal → live → end` now updates the Event, active session, and canonical live state in one RLS-respecting `SECURITY INVOKER` RPC. A rollback acceptance test confirmed exactly one active session through switches, matching live-state foreign keys, clean end state, and denial for a foreign authenticated UUID.

Live Auto Slideshow was added on 2026-08-27: the host can start/stop a 10/20/30-second cycle from the Live console. The client receives only the already-filtered `approved + public_allowed` candidate IDs, serializes server actions to prevent overlapping transitions, and stops when the console closes. Manual show controls remain available.

Live screen controls became transactional on 2026-08-27. Show and clear operations now lock the Event, require an active session, increment the canonical revision atomically, and re-check the selected item inside Postgres (`approved/used + public_allowed + !do_not_use`). A rollback acceptance test confirmed monotonic revisions, correct session linkage, a clean clear state, and rejection of a private item.

Questionnaire creation became transactional on 2026-08-27. The questionnaire, deterministic public capability hash, and complete 4/23-question starter set are now written by one RLS-respecting `SECURITY INVOKER` RPC. A rollback acceptance test confirmed complete creation for the owner, zero persisted QA rows, and denial for a foreign authenticated UUID; `anon` and `PUBLIC` have no execute grant.

Question reordering became transactional on 2026-08-28. Adjacent swaps now run in one `SECURITY INVOKER` RPC under a questionnaire row lock; ownership and Event/questionnaire membership are re-checked in Postgres, and list boundaries return a harmless no-op instead of issuing partial PATCH requests.

Production privacy headers were hardened on 2026-08-27: capability URLs are never sent as referrers, the Pilot is excluded from indexing/archiving, framing is denied, MIME sniffing is disabled, and cross-origin opener isolation is enabled. A restrictive CSP remains intentionally deferred until direct signed-upload behavior is covered by physical mobile media QA.

Battle Backup was aligned with the handoff safety contract on 2026-08-27: CSV includes media IDs and filenames, JSON includes the active Live session and canonical Live state, and the printable Event Kit contains only approved/used program blocks plus a separate visible do-not-use/warning section. Drafts no longer silently enter the offline run sheet.

Failure-case simulations passed on 2026-08-27: sequential rapid submit with one idempotency key creates one submission/respondent; missing required answers, closed questionnaires, and cross-questionnaire question IDs are rejected. Event A question/media/Event Kit references cannot be submitted, attached, or shown through Event B, and a rejected cross-Event Live command leaves Event B's canonical state unchanged. Every simulation used rollback and left zero QA rows.

Event ownership scope became immutable at the database boundary on 2026-08-28. A direct authenticated tampering simulation showed that RLS alone allowed an owner to reassign an Event Kit row between two Events owned by the same Host. Update triggers now reject changes to `host_id`/`event_id` across every Event-scoped table and reject Event `host_id` reassignment, closing this cross-Event mutation class independently of UI filters.

External release gates: enable Supabase leaked-password protection, finish Media v1 physical mobile/video/audio QA, perform the final logged-in UI click-through for transactional questionnaire creation, Live, and Auto Slideshow, and complete the remaining pilot acceptance checks. The Host Auth user, GitHub remote, production alias, Smart Draft flow, image upload/read/privacy QA, exports, transactional questionnaire/Live data boundaries, and core two-Event isolation checks are complete.

## Product-completion checkpoint — 2026-08-28

Host operations now include editable Event details and private notes, a reversible archive/restore path, archived-list visibility, a separate Account screen, editable profile name, and authenticated password change. Dashboard Event rows now show real submitted-response counts.

Published questionnaires now expose working copy/open/download controls and a generated PNG QR code. Public long-form answers auto-save locally with explicit local-only wording, restore after reload, exclude file objects, and retain the submission idempotency key so an uncertain mobile response cannot become a duplicate after refresh. Public copy is host-neutral and works for both isolated Host accounts.

The browser security baseline now includes a restrictive production Content Security Policy scoped to the app and its configured Supabase origin. Public submission flood protection is active in `public-api` v4: each published questionnaire has an atomic 300 submissions / 15 minute ceiling. The private counter rejects unknown capabilities, stores no guest IP address, and is executable only by `service_role`; `anon` and `authenticated` have no grant.

The product/admin strict UX audit now passes with zero findings. Canonical form validation ownership, textarea behavior, archive semantics, resource non-disclosure, QR/share behavior, and responsive account/Event settings layouts are recorded in `UX-CONTRACT.md`.

Outstanding external gates are intentionally not mislabeled as code defects: Supabase Auth currently reports open signup and must be switched off in Dashboard to enforce the two-user allowlist; leaked-password protection remains plan-gated; physical iPhone/Android photo/video/audio and venue display/HDMI checks require real devices; real AI generation requires an explicitly configured server-side model key. Deterministic Smart Draft and every manual operational fallback remain available without AI.

Guest questionnaire creation was expanded on 2026-08-28 from a four-question placeholder to a 14-question operational starter. The Host chooses either a private Host brief or available customer/couple/bride/groom submissions as the context source. Customer and brief signals can add narrowly scoped travel, family, music, or work/study modules without copying private source text into the public questionnaire description. Missing customer submissions fall back to Event metadata plus the Host brief, and every generated question remains editable before publishing.

Fast Event Mode was added on 2026-08-28 for the five-minute-break scenario. The Responses screen selects all clean, public answers by default, groups them by question, exposes `Select all / Clear all`, and creates ready Event Kit interactives in one submit. Only obvious profanity/insults enter the Host review queue. Media has no separate approval step: it remains private until the Host's explicit `Build interactives` or `Add to slideshow` action promotes only those selected assets.

The deterministic interactive set now includes: multiple `100 до 1` boards with points equal to real guest-answer frequency; mandatory event-aware `Хто це сказав?` quote cards with a separate author reveal; manually authored numeric `Клуб дилетантів` questions with answer/consequence reveal; and multi-file slideshows with manual next-file and autoplay controls. No model key is required for these mechanics.

Public Screen is now structurally restricted at the Postgres RPC boundary to `interactive` and `media` Event Kit item types. Raw stories, notes, facts, warnings, and standalone answers cannot be shown even if a client submits their IDs. Slideshow objects remain in the private bucket; `public-api` v5 issues a 60-second signed URL only when the requested asset belongs to the Event's currently active public slideshow.
