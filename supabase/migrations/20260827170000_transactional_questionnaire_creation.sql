begin;

create or replace function public.create_questionnaire_with_questions_tx(
  p_questionnaire_id uuid,
  p_event_id uuid,
  p_audience text,
  p_title text,
  p_public_token_hash text,
  p_questions jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_host_id uuid;
  v_questionnaire_id uuid;
begin
  if p_audience not in ('customer', 'guest', 'bride', 'groom', 'couple', 'other') then
    raise exception using errcode = '22023', message = 'Invalid questionnaire audience.';
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'Invalid questionnaire title.';
  end if;
  if p_public_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid questionnaire capability hash.';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception using errcode = '22023', message = 'Invalid starter question set.';
  end if;
  if jsonb_array_length(p_questions) < 1 or jsonb_array_length(p_questions) > 50 then
    raise exception using errcode = '22023', message = 'Invalid starter question set.';
  end if;

  select event.host_id
  into v_host_id
  from public.events as event
  where event.id = p_event_id
    and event.host_id = (select auth.uid())
  for update;

  if v_host_id is null then
    raise exception using errcode = 'P0002', message = 'Event not found.';
  end if;

  insert into public.questionnaires (
    id,
    host_id,
    event_id,
    audience,
    title,
    status,
    public_token_hash
  )
  values (
    p_questionnaire_id,
    v_host_id,
    p_event_id,
    p_audience,
    trim(p_title),
    'draft',
    p_public_token_hash
  )
  returning id into v_questionnaire_id;

  insert into public.questions (
    host_id,
    event_id,
    questionnaire_id,
    type,
    prompt,
    help_text,
    is_required,
    sort_order,
    default_privacy
  )
  select
    v_host_id,
    p_event_id,
    v_questionnaire_id,
    question.type,
    question.prompt,
    nullif(question.help_text, ''),
    question.is_required,
    question.sort_order,
    question.default_privacy
  from jsonb_to_recordset(p_questions) as question(
    type text,
    prompt text,
    help_text text,
    is_required boolean,
    sort_order integer,
    default_privacy text
  );

  if (select count(*) from public.questions where questionnaire_id = v_questionnaire_id) <> jsonb_array_length(p_questions) then
    raise exception using errcode = 'P0001', message = 'Starter question set was not created completely.';
  end if;

  return v_questionnaire_id;
end;
$$;

revoke all on function public.create_questionnaire_with_questions_tx(uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.create_questionnaire_with_questions_tx(uuid, uuid, text, text, text, jsonb) to authenticated;

commit;
