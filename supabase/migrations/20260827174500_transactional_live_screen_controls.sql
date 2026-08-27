begin;

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
begin
  select event.host_id into v_host_id
  from public.events as event
  where event.id = p_event_id and event.host_id = (select auth.uid())
  for update;

  if v_host_id is null then
    raise exception using errcode = 'P0002', message = 'Event not found.';
  end if;

  select session.id, session.mode into v_session_id, v_session_mode
  from public.live_sessions as session
  where session.event_id = p_event_id
    and session.host_id = v_host_id
    and session.status = 'active'
  order by session.started_at desc
  limit 1;

  if v_session_id is null then
    raise exception using errcode = '55000', message = 'No active live session.';
  end if;

  select item.* into v_item
  from public.event_kit_items as item
  where item.id = p_item_id
    and item.event_id = p_event_id
    and item.host_id = v_host_id
    and item.status in ('approved', 'used')
    and item.privacy_status = 'public_allowed'
    and item.do_not_use = false;

  if v_item.id is null then
    raise exception using errcode = 'P0002', message = 'Public Event Kit item not found.';
  end if;

  update public.live_state
  set live_session_id = v_session_id,
      revision = revision + 1,
      mode = case when v_item.item_type = 'question' then 'question' when v_item.item_type = 'media' then 'media' else 'message' end,
      source_event_kit_item_id = v_item.id,
      public_payload = jsonb_build_object(
        'kind', case when v_item.item_type = 'question' then 'question' when v_item.item_type = 'media' then 'media' else 'message' end,
        'item_type', v_item.item_type,
        'title', v_item.title,
        'content', v_item.content,
        'session_mode', v_session_mode
      )
  where event_id = p_event_id and host_id = v_host_id
  returning revision into v_revision;

  if v_revision is null then
    raise exception using errcode = '55000', message = 'Live state is not initialized.';
  end if;
  return v_revision;
end;
$$;

create or replace function public.clear_public_screen_tx(p_event_id uuid)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_host_id uuid;
  v_session_id uuid;
  v_session_mode text;
  v_revision bigint;
begin
  select event.host_id into v_host_id
  from public.events as event
  where event.id = p_event_id and event.host_id = (select auth.uid())
  for update;

  if v_host_id is null then
    raise exception using errcode = 'P0002', message = 'Event not found.';
  end if;

  select session.id, session.mode into v_session_id, v_session_mode
  from public.live_sessions as session
  where session.event_id = p_event_id
    and session.host_id = v_host_id
    and session.status = 'active'
  order by session.started_at desc
  limit 1;

  if v_session_id is null then
    raise exception using errcode = '55000', message = 'No active live session.';
  end if;

  update public.live_state
  set live_session_id = v_session_id,
      revision = revision + 1,
      mode = 'clear',
      source_event_kit_item_id = null,
      public_payload = jsonb_build_object('kind', 'clear', 'session_mode', v_session_mode)
  where event_id = p_event_id and host_id = v_host_id
  returning revision into v_revision;

  if v_revision is null then
    raise exception using errcode = '55000', message = 'Live state is not initialized.';
  end if;
  return v_revision;
end;
$$;

revoke all on function public.show_event_kit_item_tx(uuid, uuid) from public, anon;
revoke all on function public.clear_public_screen_tx(uuid) from public, anon;
grant execute on function public.show_event_kit_item_tx(uuid, uuid) to authenticated;
grant execute on function public.clear_public_screen_tx(uuid) to authenticated;

commit;
