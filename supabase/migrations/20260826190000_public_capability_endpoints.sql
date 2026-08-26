begin;

create or replace function public.get_public_questionnaire(p_questionnaire_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', questionnaire.id,
    'title', questionnaire.title,
    'description', questionnaire.description,
    'audience', questionnaire.audience,
    'allow_images', questionnaire.allow_images,
    'allow_video', questionnaire.allow_video,
    'allow_audio', questionnaire.allow_audio,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', question.id,
          'type', question.type,
          'prompt', question.prompt,
          'help_text', question.help_text,
          'is_required', question.is_required,
          'sort_order', question.sort_order,
          'settings', question.settings
        ) order by question.sort_order, question.created_at
      )
      from public.questions question
      where question.questionnaire_id = questionnaire.id
        and question.event_id = questionnaire.event_id
        and question.host_id = questionnaire.host_id
        and question.is_active = true
    ), '[]'::jsonb)
  )
  from public.questionnaires questionnaire
  where questionnaire.public_token_hash = p_questionnaire_token_hash
    and questionnaire.status = 'published'
    and p_questionnaire_token_hash ~ '^[0-9a-f]{64}$'
  limit 1;
$$;

revoke all on function public.get_public_questionnaire(text) from public, authenticated;
grant execute on function public.get_public_questionnaire(text) to anon, service_role;

create or replace function public.get_public_screen_state(p_public_screen_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'event_title', event.title,
    'revision', coalesce(state.revision, 0),
    'mode', coalesce(state.mode, 'idle'),
    'public_payload', coalesce(state.public_payload, '{}'::jsonb),
    'updated_at', coalesce(state.updated_at, event.updated_at)
  )
  from public.events event
  left join public.live_state state on state.event_id = event.id and state.host_id = event.host_id
  where event.public_screen_token_hash = p_public_screen_token_hash
    and event.public_screen_enabled = true
    and p_public_screen_token_hash ~ '^[0-9a-f]{64}$'
  limit 1;
$$;

revoke all on function public.get_public_screen_state(text) from public, authenticated;
grant execute on function public.get_public_screen_state(text) to anon, service_role;

revoke all on function public.submit_questionnaire(text, text, text, jsonb) from public, authenticated;
grant execute on function public.submit_questionnaire(text, text, text, jsonb) to anon, service_role;

alter function public.submit_questionnaire(text, text, text, jsonb) security definer;

commit;
