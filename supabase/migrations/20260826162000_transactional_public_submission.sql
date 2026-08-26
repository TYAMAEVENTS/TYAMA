begin;

create or replace function private.submit_questionnaire(
  p_questionnaire_token_hash text,
  p_idempotency_key_hash text,
  p_display_name text,
  p_answers jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_questionnaire public.questionnaires%rowtype;
  target_question public.questions%rowtype;
  existing_submission_id uuid;
  new_respondent_id uuid;
  new_submission_id uuid;
  answer_item jsonb;
  answer_question_id uuid;
  answer_text_value text;
  answer_json_value jsonb;
begin
  if p_questionnaire_token_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid submission capability.';
  end if;

  select * into target_questionnaire
  from public.questionnaires
  where public_token_hash = p_questionnaire_token_hash
    and status = 'published'
  limit 1;

  if not found then
    raise exception using errcode = '22023', message = 'Questionnaire is unavailable.';
  end if;

  select id into existing_submission_id
  from public.submissions
  where idempotency_key_hash = p_idempotency_key_hash
  limit 1;

  if existing_submission_id is not null then
    return existing_submission_id;
  end if;

  if nullif(btrim(p_display_name), '') is null or char_length(p_display_name) > 160 then
    raise exception using errcode = '22023', message = 'Respondent name is invalid.';
  end if;

  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 100 then
    raise exception using errcode = '22023', message = 'Answers payload is invalid.';
  end if;

  insert into public.respondents (host_id, event_id, display_name)
  values (target_questionnaire.host_id, target_questionnaire.event_id, btrim(p_display_name))
  returning id into new_respondent_id;

  insert into public.submissions (
    host_id,
    event_id,
    questionnaire_id,
    respondent_id,
    status,
    idempotency_key_hash
  ) values (
    target_questionnaire.host_id,
    target_questionnaire.event_id,
    target_questionnaire.id,
    new_respondent_id,
    'draft',
    p_idempotency_key_hash
  ) returning id into new_submission_id;

  for answer_item in select value from jsonb_array_elements(p_answers)
  loop
    begin
      answer_question_id := (answer_item ->> 'question_id')::uuid;
    exception when others then
      raise exception using errcode = '22023', message = 'Answer question is invalid.';
    end;

    select * into target_question
    from public.questions
    where id = answer_question_id
      and questionnaire_id = target_questionnaire.id
      and event_id = target_questionnaire.event_id
      and host_id = target_questionnaire.host_id
      and is_active = true
    limit 1;

    if not found then
      raise exception using errcode = '22023', message = 'Answer does not belong to this questionnaire.';
    end if;

    answer_text_value := nullif(btrim(answer_item ->> 'answer_text'), '');
    answer_json_value := answer_item -> 'answer_json';
    if answer_json_value = 'null'::jsonb then answer_json_value := null; end if;

    if answer_text_value is null and answer_json_value is null then
      raise exception using errcode = '22023', message = 'Answer value is empty.';
    end if;
    if answer_text_value is not null and char_length(answer_text_value) > 10000 then
      raise exception using errcode = '22023', message = 'Answer value is too long.';
    end if;

    insert into public.answers (
      host_id,
      event_id,
      submission_id,
      question_id,
      answer_text,
      answer_json,
      privacy_status,
      moderation_status
    ) values (
      target_questionnaire.host_id,
      target_questionnaire.event_id,
      new_submission_id,
      target_question.id,
      answer_text_value,
      answer_json_value,
      target_question.default_privacy,
      'pending'
    );
  end loop;

  if exists (
    select 1
    from public.questions required_question
    where required_question.questionnaire_id = target_questionnaire.id
      and required_question.event_id = target_questionnaire.event_id
      and required_question.host_id = target_questionnaire.host_id
      and required_question.is_active = true
      and required_question.is_required = true
      and not exists (
        select 1
        from public.answers submitted_answer
        where submitted_answer.submission_id = new_submission_id
          and submitted_answer.question_id = required_question.id
      )
  ) then
    raise exception using errcode = '22023', message = 'Required answers are missing.';
  end if;

  update public.submissions
  set status = 'submitted', submitted_at = now()
  where id = new_submission_id;

  return new_submission_id;
end;
$$;

revoke all on function private.submit_questionnaire(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function private.submit_questionnaire(text, text, text, jsonb) to service_role;

create or replace function public.submit_questionnaire(
  p_questionnaire_token_hash text,
  p_idempotency_key_hash text,
  p_display_name text,
  p_answers jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.submit_questionnaire(
    p_questionnaire_token_hash,
    p_idempotency_key_hash,
    p_display_name,
    p_answers
  );
$$;

revoke all on function public.submit_questionnaire(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_questionnaire(text, text, text, jsonb) to service_role;

commit;
