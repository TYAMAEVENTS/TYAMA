# TYAMA Pilot UX Contract

Visual source: `DESIGN.md`. Business and security sources: handoff `02`, `03`, `04`, `12`, `14`, and `08`.

## Canonical ownership

| Capability | Owner | Decision |
|---|---|---|
| Form | shared field primitives + server action result | `noValidate`, submit then correct, inline + form error, first-invalid focus |
| Select/Listbox | native for Pilot | platform popup accepted; no CSS claim over open popup |
| Date | native date-only | platform picker accepted; database stores `date` without timezone conversion |
| Toast/status | shared live status region | stable placement, action-aligned Ukrainian copy, no raw backend errors |
| CRUD | server actions + route helpers | create returns to owning Event workspace; edits stay in context |
| Scrollbar | global stylesheet | visible tokenized baseline, no opt-in class |
| Dataset navigation | server pagination when unbounded | URL state; bounded small lists may render all |

## Behavior ledger

| Operation | Trigger | Pending | Success | Failure | Focus |
|---|---|---|---|---|---|
| Create Event | `Створити подію` | stable busy button | new Event workspace | persistent form error | page title / first invalid field |
| Save edit | `Зберегти зміни` | stable busy button | stay in context + status | inline + summary | updated heading / first invalid |
| Publish | `Опублікувати` | pessimistic | stay + public-link state | persistent panel error | status region |
| Archive | `Архівувати` | warning confirmation | dashboard | dialog error | next Event/dashboard heading |
| Public submit | `Надіслати відповіді` | idempotent busy | clear success state | preserve entered data | error summary / success heading |

## Security and privacy UI

- UI hiding never replaces server/RLS authorization.
- Authenticated cross-owner access renders 403; missing resources render 404.
- Public Screen never exposes raw answers, internal notes, contacts, or full Event Kit rows.
- Privacy changes are pessimistic and visible; public exposure requires approved + public_allowed + explicit live selection.
- Hard delete is absent from Pilot UI. Events are archived.

## Async and recovery

- Existing data stays readable during AI, realtime, or refresh failure.
- AI errors never erase the last successful Event Kit and always leave manual add/edit available.
- Public Screen keeps its last valid payload and polls canonical state during realtime loss.
- Duplicate mutations are blocked; public final submission uses an idempotency key.
- Session expiry redirects to login while preserving only non-sensitive navigation intent.

## Routes and titles

Pattern: `{Page} — ТЯМА`. Route-backed workspace sections remain bookmarkable. Back/refresh preserve committed route state. Error, loading, 403, and 404 routes own honest titles.

## Responsive and accessibility

Target WCAG 2.2 AA. Questionnaire works at narrow mobile widths; Host workspace works on a normal laptop; Public Screen works in a separate browser/display. Controls keep visible focus and 44px practical touch size. Reduced motion removes transforms and keeps only fast opacity changes.
