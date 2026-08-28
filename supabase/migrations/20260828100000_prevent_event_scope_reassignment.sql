begin;

create or replace function private.prevent_event_scope_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.host_id is distinct from old.host_id
     or new.event_id is distinct from old.event_id then
    raise exception using errcode = '42501', message = 'Event ownership scope is immutable.';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_event_host_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.host_id is distinct from old.host_id then
    raise exception using errcode = '42501', message = 'Event ownership is immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists events_prevent_host_reassignment on public.events;
create trigger events_prevent_host_reassignment
before update on public.events
for each row execute function private.prevent_event_host_reassignment();

drop trigger if exists questionnaires_prevent_scope_reassignment on public.questionnaires;
create trigger questionnaires_prevent_scope_reassignment
before update on public.questionnaires
for each row execute function private.prevent_event_scope_reassignment();

drop trigger if exists questions_prevent_scope_reassignment on public.questions;
create trigger questions_prevent_scope_reassignment
before update on public.questions
for each row execute function private.prevent_event_scope_reassignment();

drop trigger if exists respondents_prevent_scope_reassignment on public.respondents;
create trigger respondents_prevent_scope_reassignment
before update on public.respondents
for each row execute function private.prevent_event_scope_reassignment();

drop trigger if exists submissions_prevent_scope_reassignment on public.submissions;
create trigger submissions_prevent_scope_reassignment
before update on public.submissions
for each row execute function private.prevent_event_scope_reassignment();

drop trigger if exists answers_prevent_scope_reassignment on public.answers;
create trigger answers_prevent_scope_reassignment
before update on public.answers
for each row execute function private.prevent_event_scope_reassignment();

drop trigger if exists media_assets_prevent_scope_reassignment on public.media_assets;
create trigger media_assets_prevent_scope_reassignment
before update on public.media_assets
for each row execute function private.prevent_event_scope_reassignment();

drop trigger if exists event_kit_items_prevent_scope_reassignment on public.event_kit_items;
create trigger event_kit_items_prevent_scope_reassignment
before update on public.event_kit_items
for each row execute function private.prevent_event_scope_reassignment();

drop trigger if exists live_sessions_prevent_scope_reassignment on public.live_sessions;
create trigger live_sessions_prevent_scope_reassignment
before update on public.live_sessions
for each row execute function private.prevent_event_scope_reassignment();

drop trigger if exists live_state_prevent_scope_reassignment on public.live_state;
create trigger live_state_prevent_scope_reassignment
before update on public.live_state
for each row execute function private.prevent_event_scope_reassignment();

revoke all on function private.prevent_event_scope_reassignment() from public, anon, authenticated;
revoke all on function private.prevent_event_host_reassignment() from public, anon, authenticated;

commit;
