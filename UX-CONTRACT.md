# TYAMA Pilot UX Contract

Visual source: `DESIGN.md`. Business and security sources: handoff `02`, `03`, `04`, `12`, `14`, and `08`.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | shared field primitives + server-action result | `src/components/ui`, this contract | create, inline edit, public submit | `noValidate`, persistent error, stable busy state |
| Select/Listbox | native `<select>` | `premium-ui.json` | single, multiple | keyboard, mobile platform popup, Ukrainian options |
| Date | native date-only input | `premium-ui.json` | optional event date | browser locale; Postgres `date` without timezone conversion |
| Toast | `StatusMessage` and persistent status region | `src/components/ui/status.tsx` | info, success, error | stable placement, Ukrainian copy, no raw backend errors |
| CRUD | authenticated server actions + route helpers | RLS migrations and `src/app/actions` | create, inline edit, reversible archive | owner-only mutation, recovery, post-save destination |
| Scrollbar | global stylesheet | `src/app/globals.css` | root and nested overflow | Firefox + WebKit + forced colors |
| Dataset navigation | route-backed bounded lists | API/RLS query contracts | render-all for Pilot; pagination when unbounded | narrow viewport, empty state, Back/refresh |

## Behavior ledger

| Operation | Trigger | Pending | Success | Failure | Focus |
|---|---|---|---|---|---|
| Create Event | `Створити подію` | stable busy button | new Event workspace | persistent form error | page title / first invalid field |
| Save edit | `Зберегти зміни` | stable busy button | stay in context + status | inline + summary | updated heading / first invalid |
| Publish | `Опублікувати` | pessimistic | stay + public-link state | persistent panel error | status region |
| Archive | `Архівувати` | pessimistic server action | dashboard + restore path | persistent error | next Event/dashboard heading |
| Public submit | `Надіслати відповіді` | idempotent busy | clear success state | preserve entered data | error summary / success heading |

## Security and privacy UI

- UI hiding never replaces server/RLS authorization.
- Authenticated cross-owner Event capability URLs deliberately render 404 to avoid confirming resource existence.
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
