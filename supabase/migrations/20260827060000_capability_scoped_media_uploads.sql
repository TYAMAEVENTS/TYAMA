begin;

create or replace function private.prepare_media_upload(
  p_questionnaire_token_hash text,
  p_submission_capability_hash text,
  p_question_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_questionnaire public.questionnaires%rowtype;
  target_submission public.submissions%rowtype;
  target_question public.questions%rowtype;
  target_answer_id uuid;
  new_asset_id uuid := gen_random_uuid();
  media_kind text;
  extension text;
  storage_path_value text;
begin
  if p_questionnaire_token_hash !~ '^[0-9a-f]{64}$'
     or p_submission_capability_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid media capability.';
  end if;

  select * into target_questionnaire
  from public.questionnaires
  where public_token_hash = p_questionnaire_token_hash
    and status = 'published'
  limit 1;

  if not found then
    raise exception using errcode = '22023', message = 'Questionnaire is unavailable.';
  end if;

  select * into target_submission
  from public.submissions
  where idempotency_key_hash = p_submission_capability_hash
    and questionnaire_id = target_questionnaire.id
    and event_id = target_questionnaire.event_id
    and host_id = target_questionnaire.host_id
    and status in ('submitted', 'reviewed')
  limit 1;

  if not found then
    raise exception using errcode = '22023', message = 'Submission is unavailable.';
  end if;

  select * into target_question
  from public.questions
  where id = p_question_id
    and questionnaire_id = target_questionnaire.id
    and event_id = target_questionnaire.event_id
    and host_id = target_questionnaire.host_id
    and type = 'media'
    and is_active = true
  limit 1;

  if not found then
    raise exception using errcode = '22023', message = 'Media question is unavailable.';
  end if;

  -- Serialize capability-scoped prepares so concurrent requests cannot bypass
  -- the per-submission media limit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_submission.id::text, 0)
  );

  media_kind := case
    when p_mime_type in ('image/jpeg', 'image/png', 'image/webp') then 'image'
    when p_mime_type in ('video/mp4', 'video/quicktime') then 'video'
    when p_mime_type in ('audio/mpeg', 'audio/mp4', 'audio/wav') then 'audio'
    else null
  end;

  if media_kind is null
     or (media_kind = 'image' and not target_questionnaire.allow_images)
     or (media_kind = 'video' and not target_questionnaire.allow_video)
     or (media_kind = 'audio' and not target_questionnaire.allow_audio) then
    raise exception using errcode = '22023', message = 'This media type is not allowed.';
  end if;

  if p_size_bytes <= 0
     or p_size_bytes > 104857600
     or (media_kind = 'image' and p_size_bytes > 10485760)
     or (media_kind = 'audio' and p_size_bytes > 26214400) then
    raise exception using errcode = '22023', message = 'File size is not allowed.';
  end if;

  if (
    select count(*)
    from public.media_assets asset
    where asset.submission_id = target_submission.id
      and asset.event_id = target_submission.event_id
      and asset.host_id = target_submission.host_id
      and asset.status <> 'deleted'
  ) >= 10 then
    raise exception using errcode = '22023', message = 'Submission media limit reached.';
  end if;

  insert into public.answers (
    host_id,
    event_id,
    submission_id,
    question_id,
    answer_json,
    privacy_status,
    moderation_status
  ) values (
    target_submission.host_id,
    target_submission.event_id,
    target_submission.id,
    target_question.id,
    jsonb_build_object('media', true),
    'review_required',
    'pending'
  )
  on conflict (submission_id, question_id) do nothing;

  select answer.id into target_answer_id
  from public.answers answer
  where answer.submission_id = target_submission.id
    and answer.question_id = target_question.id
  limit 1;

  extension := case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'video/mp4' then 'mp4'
    when 'video/quicktime' then 'mov'
    when 'audio/mpeg' then 'mp3'
    when 'audio/mp4' then 'm4a'
    when 'audio/wav' then 'wav'
  end;
  storage_path_value := concat(
    target_submission.host_id::text, '/',
    target_submission.event_id::text, '/',
    target_submission.id::text, '/',
    new_asset_id::text, '.', extension
  );

  insert into public.media_assets (
    id,
    host_id,
    event_id,
    submission_id,
    answer_id,
    kind,
    storage_path,
    original_filename,
    mime_type,
    size_bytes,
    status,
    privacy_status,
    moderation_status
  ) values (
    new_asset_id,
    target_submission.host_id,
    target_submission.event_id,
    target_submission.id,
    target_answer_id,
    media_kind,
    storage_path_value,
    left(nullif(btrim(p_original_filename), ''), 255),
    p_mime_type,
    p_size_bytes,
    'pending',
    'review_required',
    'pending'
  );

  return jsonb_build_object(
    'asset_id', new_asset_id,
    'storage_path', storage_path_value,
    'kind', media_kind
  );
end;
$$;

revoke all on function private.prepare_media_upload(text, text, uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function private.prepare_media_upload(text, text, uuid, text, text, bigint) to service_role;

create or replace function private.complete_media_upload(
  p_submission_capability_hash text,
  p_asset_id uuid,
  p_actual_size_bytes bigint,
  p_actual_mime_type text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_asset public.media_assets%rowtype;
begin
  if p_submission_capability_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid media capability.';
  end if;

  select asset.* into target_asset
  from public.media_assets asset
  join public.submissions submission
    on submission.id = asset.submission_id
   and submission.event_id = asset.event_id
   and submission.host_id = asset.host_id
  where asset.id = p_asset_id
    and asset.status = 'pending'
    and submission.idempotency_key_hash = p_submission_capability_hash
  limit 1;

  if not found then
    raise exception using errcode = '22023', message = 'Media asset is unavailable.';
  end if;

  if p_actual_size_bytes <> target_asset.size_bytes
     or p_actual_mime_type <> target_asset.mime_type then
    update public.media_assets
    set status = 'rejected', moderation_status = 'rejected'
    where id = target_asset.id;
    return false;
  end if;

  update public.media_assets
  set status = 'ready'
  where id = target_asset.id;
  return true;
end;
$$;

revoke all on function private.complete_media_upload(text, uuid, bigint, text) from public, anon, authenticated;
grant execute on function private.complete_media_upload(text, uuid, bigint, text) to service_role;

create or replace function public.prepare_media_upload(
  p_questionnaire_token_hash text,
  p_submission_capability_hash text,
  p_question_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.prepare_media_upload(
    p_questionnaire_token_hash,
    p_submission_capability_hash,
    p_question_id,
    p_original_filename,
    p_mime_type,
    p_size_bytes
  );
$$;

revoke all on function public.prepare_media_upload(text, text, uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.prepare_media_upload(text, text, uuid, text, text, bigint) to service_role;

create or replace function public.complete_media_upload(
  p_submission_capability_hash text,
  p_asset_id uuid,
  p_actual_size_bytes bigint,
  p_actual_mime_type text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.complete_media_upload(
    p_submission_capability_hash,
    p_asset_id,
    p_actual_size_bytes,
    p_actual_mime_type
  );
$$;

revoke all on function public.complete_media_upload(text, uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.complete_media_upload(text, uuid, bigint, text) to service_role;

commit;
