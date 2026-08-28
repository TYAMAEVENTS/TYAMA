begin;

create table private.public_submission_rate_limits (
  questionnaire_token_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (questionnaire_token_hash, window_started_at)
);

revoke all on table private.public_submission_rate_limits from public, anon, authenticated;

create or replace function public.consume_public_submission_limit(
  p_questionnaire_token_hash text,
  p_limit integer default 300,
  p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  next_count integer;
begin
  if p_questionnaire_token_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 60 or p_window_seconds > 86400 then
    return false;
  end if;

  if not exists (
    select 1 from public.questionnaires
    where public_token_hash = p_questionnaire_token_hash
      and status = 'published'
  ) then
    return false;
  end if;

  current_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into private.public_submission_rate_limits (questionnaire_token_hash, window_started_at, request_count)
  values (p_questionnaire_token_hash, current_window, 1)
  on conflict (questionnaire_token_hash, window_started_at)
  do update set request_count = private.public_submission_rate_limits.request_count + 1
  returning request_count into next_count;

  return next_count <= p_limit;
end;
$$;

revoke all on function public.consume_public_submission_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_public_submission_limit(text, integer, integer) to service_role;

commit;
