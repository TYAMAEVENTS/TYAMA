begin;

create or replace function public.start_live_session_tx(
  p_event_id uuid,
  p_mode text,
  p_public_screen_token_hash text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_host_id uuid;
  v_session_id uuid;
begin
  if p_mode not in ('rehearsal', 'live') then
    raise exception using errcode = '22023', message = 'Invalid live session mode.';
  end if;
  if p_public_screen_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid public screen capability hash.';
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

  update public.live_sessions
  set status = 'ended', ended_at = now()
  where event_id = p_event_id
    and host_id = v_host_id
    and status = 'active';

  insert into public.live_sessions (host_id, event_id, mode, status)
  values (v_host_id, p_event_id, p_mode, 'active')
  returning id into v_session_id;

  insert into public.live_state (
    event_id,
    host_id,
    live_session_id,
    revision,
    mode,
    source_event_kit_item_id,
    public_payload
  )
  values (
    p_event_id,
    v_host_id,
    v_session_id,
    1,
    'clear',
    null,
    jsonb_build_object('kind', 'clear', 'session_mode', p_mode)
  )
  on conflict (event_id) do update
  set host_id = excluded.host_id,
      live_session_id = excluded.live_session_id,
      revision = public.live_state.revision + 1,
      mode = 'clear',
      source_event_kit_item_id = null,
      public_payload = excluded.public_payload;

  update public.events
  set public_screen_enabled = true,
      public_screen_token_hash = p_public_screen_token_hash,
      status = case when p_mode = 'live' then 'live' else 'preparing' end
  where id = p_event_id
    and host_id = v_host_id;

  return v_session_id;
end;
$$;

create or replace function public.end_live_session_tx(p_event_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_host_id uuid;
  v_ended boolean := false;
begin
  select event.host_id
  into v_host_id
  from public.events as event
  where event.id = p_event_id
    and event.host_id = (select auth.uid())
  for update;

  if v_host_id is null then
    raise exception using errcode = 'P0002', message = 'Event not found.';
  end if;

  update public.live_sessions
  set status = 'ended', ended_at = now()
  where event_id = p_event_id
    and host_id = v_host_id
    and status = 'active';
  v_ended := found;

  if v_ended then
    update public.live_state
    set live_session_id = null,
        revision = revision + 1,
        mode = 'clear',
        source_event_kit_item_id = null,
        public_payload = jsonb_build_object('kind', 'clear')
    where event_id = p_event_id
      and host_id = v_host_id;

    update public.events
    set status = 'ready'
    where id = p_event_id
      and host_id = v_host_id;
  end if;

  return v_ended;
end;
$$;

revoke all on function public.start_live_session_tx(uuid, text, text) from public, anon;
revoke all on function public.end_live_session_tx(uuid) from public, anon;
grant execute on function public.start_live_session_tx(uuid, text, text) to authenticated;
grant execute on function public.end_live_session_tx(uuid) to authenticated;

commit;
