begin;

create or replace function public.move_question_tx(
  p_event_id uuid,
  p_questionnaire_id uuid,
  p_question_id uuid,
  p_direction text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_host_id uuid;
  v_current_order integer;
  v_other_id uuid;
  v_other_order integer;
begin
  if p_direction not in ('up', 'down') then
    raise exception using errcode = '22023', message = 'Invalid move direction.';
  end if;

  select questionnaire.host_id into v_host_id
  from public.questionnaires as questionnaire
  where questionnaire.id = p_questionnaire_id
    and questionnaire.event_id = p_event_id
    and questionnaire.host_id = (select auth.uid())
  for update;

  if v_host_id is null then
    raise exception using errcode = 'P0002', message = 'Questionnaire not found.';
  end if;

  select question.sort_order into v_current_order
  from public.questions as question
  where question.id = p_question_id
    and question.questionnaire_id = p_questionnaire_id
    and question.event_id = p_event_id
    and question.host_id = v_host_id;

  if v_current_order is null then
    raise exception using errcode = 'P0002', message = 'Question not found.';
  end if;

  if p_direction = 'up' then
    select question.id, question.sort_order into v_other_id, v_other_order
    from public.questions as question
    where question.questionnaire_id = p_questionnaire_id
      and question.event_id = p_event_id
      and question.host_id = v_host_id
      and (question.sort_order, question.created_at, question.id) < (
        select current.sort_order, current.created_at, current.id
        from public.questions as current where current.id = p_question_id
      )
    order by question.sort_order desc, question.created_at desc, question.id desc
    limit 1;
  else
    select question.id, question.sort_order into v_other_id, v_other_order
    from public.questions as question
    where question.questionnaire_id = p_questionnaire_id
      and question.event_id = p_event_id
      and question.host_id = v_host_id
      and (question.sort_order, question.created_at, question.id) > (
        select current.sort_order, current.created_at, current.id
        from public.questions as current where current.id = p_question_id
      )
    order by question.sort_order asc, question.created_at asc, question.id asc
    limit 1;
  end if;

  if v_other_id is null then return false; end if;

  update public.questions
  set sort_order = case id
    when p_question_id then v_other_order
    when v_other_id then v_current_order
  end
  where id in (p_question_id, v_other_id)
    and questionnaire_id = p_questionnaire_id
    and event_id = p_event_id
    and host_id = v_host_id;

  return true;
end;
$$;

revoke all on function public.move_question_tx(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.move_question_tx(uuid, uuid, uuid, text) to authenticated;

commit;
