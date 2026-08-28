begin;

create or replace function private.contains_blocked_guest_language(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(lower(value), '') ~
    '(^|[^а-яіїєґa-z])(бл(я|ять|ядь)|хуй|хує|хуя|пизд|їба|єба|еба|сука|сучка|довбойоб|долбоеб|мудак|гандон|шлюха|мразь|ідіот|идиот|дебіл|дебил|придурок|тварина|тварь)([^а-яіїєґa-z]|$)';
$$;

revoke all on function private.contains_blocked_guest_language(text) from public, anon, authenticated;

create or replace function private.triage_new_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  question_privacy text;
  answer_value text;
begin
  select question.default_privacy into question_privacy
  from public.questions as question
  where question.id = new.question_id;

  answer_value := coalesce(new.answer_text, new.answer_json::text, '');
  if question_privacy = 'host_only' then
    new.privacy_status := 'host_only';
    new.moderation_status := 'approved';
    new.is_useful := true;
  elsif private.contains_blocked_guest_language(answer_value) then
    new.privacy_status := 'review_required';
    new.moderation_status := 'pending';
    new.is_useful := false;
  else
    new.privacy_status := 'public_allowed';
    new.moderation_status := 'approved';
    new.is_useful := true;
  end if;
  return new;
end;
$$;

revoke all on function private.triage_new_answer() from public, anon, authenticated;

drop trigger if exists answers_triage_on_insert on public.answers;
create trigger answers_triage_on_insert
before insert on public.answers
for each row execute function private.triage_new_answer();

update public.answers as answer
set privacy_status = case
      when question.default_privacy = 'host_only' then 'host_only'
      when private.contains_blocked_guest_language(coalesce(answer.answer_text, answer.answer_json::text, '')) then 'review_required'
      else 'public_allowed'
    end,
    moderation_status = case
      when question.default_privacy = 'host_only' then 'approved'
      when private.contains_blocked_guest_language(coalesce(answer.answer_text, answer.answer_json::text, '')) then 'pending'
      else 'approved'
    end,
    is_useful = not private.contains_blocked_guest_language(coalesce(answer.answer_text, answer.answer_json::text, ''))
from public.questions as question
where question.id = answer.question_id
  and answer.moderation_status = 'pending';

insert into public.questions (
  host_id, event_id, questionnaire_id, type, prompt, help_text,
  is_required, sort_order, default_privacy
)
select
  questionnaire.host_id,
  questionnaire.event_id,
  questionnaire.id,
  'long_text',
  case event.event_type
    when 'wedding' then 'Опишіть наречених однією фразою.'
    when 'birthday' then 'Опишіть іменинника або іменинницю однією фразою.'
    when 'corporate' then 'Опишіть вашу команду або героя події однією фразою.'
    else 'Опишіть героїв події однією фразою.'
  end,
  'Ця фраза може потрапити у гру «Хто це сказав?». Ведучий не показуватиме її як звичайну відповідь.',
  false,
  coalesce((select max(question.sort_order) + 10 from public.questions as question where question.questionnaire_id = questionnaire.id), 10),
  'review_required'
from public.questionnaires as questionnaire
join public.events as event on event.id = questionnaire.event_id
where questionnaire.audience in ('guest', 'other')
  and not exists (
    select 1 from public.questions as question
    where question.questionnaire_id = questionnaire.id
      and lower(question.prompt) like 'опишіть%однією фразою%'
  );

create or replace function public.show_event_kit_item_tx(p_event_id uuid, p_item_id uuid)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_host_id uuid;
  v_session_id uuid;
  v_session_mode text;
  v_item public.event_kit_items%rowtype;
  v_revision bigint;
  v_kind text;
begin
  select event.host_id into v_host_id
  from public.events as event
  where event.id = p_event_id and event.host_id = (select auth.uid())
  for update;
  if v_host_id is null then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;

  select session.id, session.mode into v_session_id, v_session_mode
  from public.live_sessions as session
  where session.event_id = p_event_id and session.host_id = v_host_id and session.status = 'active'
  order by session.started_at desc limit 1;
  if v_session_id is null then raise exception using errcode = '55000', message = 'No active live session.'; end if;

  select item.* into v_item
  from public.event_kit_items as item
  where item.id = p_item_id
    and item.event_id = p_event_id
    and item.host_id = v_host_id
    and item.status in ('approved', 'used')
    and item.privacy_status = 'public_allowed'
    and item.do_not_use = false
    and item.item_type in ('interactive', 'media');
  if v_item.id is null then raise exception using errcode = 'P0002', message = 'Public interactive not found.'; end if;

  v_kind := case
    when v_item.item_type = 'media' then 'media'
    when v_item.data ->> 'stage' = 'reveal' then 'reveal'
    else 'question'
  end;

  update public.live_state
  set live_session_id = v_session_id,
      revision = revision + 1,
      mode = v_kind,
      source_event_kit_item_id = v_item.id,
      public_payload = jsonb_build_object(
        'kind', v_kind,
        'item_type', v_item.item_type,
        'title', v_item.title,
        'content', v_item.content,
        'data', v_item.data,
        'session_mode', v_session_mode
      )
  where event_id = p_event_id and host_id = v_host_id
  returning revision into v_revision;
  if v_revision is null then raise exception using errcode = '55000', message = 'Live state is not initialized.'; end if;
  return v_revision;
end;
$$;

revoke all on function public.show_event_kit_item_tx(uuid, uuid) from public, anon;
grant execute on function public.show_event_kit_item_tx(uuid, uuid) to authenticated;

commit;
