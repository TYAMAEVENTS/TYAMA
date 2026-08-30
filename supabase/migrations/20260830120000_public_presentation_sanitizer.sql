begin;

create or replace function private.public_presentation_payload(
  p_event_id uuid,
  p_item_type text,
  p_title text,
  p_content text,
  p_data jsonb,
  p_session_mode text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kind text := coalesce(p_data ->> 'interactive_kind', '');
  v_stage text := coalesce(p_data ->> 'stage', '');
  v_public_data jsonb := '{}'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_asset_id uuid;
  v_index integer;
  v_count integer;
  v_revealed boolean;
begin
  if p_item_type = 'interactive' and v_kind = 'family_feud' and v_stage in ('intro', 'question', 'reveal') then
    select coalesce(jsonb_agg(
      case when row_revealed then
        jsonb_build_object('index', ordinal - 1, 'revealed', true, 'label', answer ->> 'label', 'points', answer -> 'points')
      else jsonb_build_object('index', ordinal - 1, 'revealed', false) end
      order by ordinal
    ), '[]'::jsonb)
    into v_rows
    from jsonb_array_elements(coalesce(p_data -> 'answers', '[]'::jsonb)) with ordinality as board(answer, ordinal)
    cross join lateral (
      select case
        when p_data ->> 'generator' = 'family_feud_v4'
          then coalesce(p_data -> 'revealed_indexes', '[]'::jsonb) @> to_jsonb(array[(ordinal - 1)::integer])
        else ordinal <= greatest(coalesce((p_data ->> 'revealed_count')::integer, 0), 0)
      end as row_revealed
    ) as reveal_state;
    v_public_data := jsonb_build_object('interactive_kind', v_kind, 'stage', v_stage, 'slots', v_rows);
    if nullif(p_data ->> 'prompt', '') is not null then v_public_data := v_public_data || jsonb_build_object('prompt', p_data ->> 'prompt'); end if;
    if coalesce((p_data ->> 'gem_visible')::boolean, false) and nullif(p_data ->> 'selected_gem', '') is not null then
      v_public_data := v_public_data || jsonb_build_object('public_bonus', jsonb_strip_nulls(jsonb_build_object(
        'label', p_data ->> 'selected_gem',
        'author', case when coalesce((p_data ->> 'gem_author_visible')::boolean, false) then nullif(p_data ->> 'gem_author', '') end
      )));
    end if;
  elsif p_item_type = 'interactive' and v_kind = 'who_said' and v_stage in ('intro', 'question', 'reveal') then
    v_revealed := coalesce((p_data ->> 'revealed')::boolean, false) and v_stage = 'reveal';
    v_public_data := jsonb_build_object('interactive_kind', v_kind, 'stage', v_stage, 'revealed', v_revealed, 'quote', coalesce(p_data ->> 'quote', p_content, ''));
    if v_revealed and nullif(p_data ->> 'author', '') is not null then
      v_public_data := v_public_data || jsonb_build_object('author', p_data ->> 'author');
      begin v_asset_id := nullif(p_data -> 'asset_ids' ->> 0, '')::uuid; exception when invalid_text_representation then v_asset_id := null; end;
      if v_asset_id is not null and exists (
        select 1 from public.media_assets as asset
        where asset.id = v_asset_id and asset.event_id = p_event_id and asset.kind = 'image'
          and asset.status = 'ready' and asset.privacy_status = 'public_allowed' and asset.moderation_status = 'approved'
      ) then v_public_data := v_public_data || jsonb_build_object('asset_ids', jsonb_build_array(v_asset_id)); end if;
    end if;
  elsif p_item_type = 'interactive' and v_kind = 'dilettantes' and v_stage in ('intro', 'question', 'reveal', 'wheel') then
    v_revealed := coalesce((p_data ->> 'revealed')::boolean, false) and v_stage = 'reveal';
    v_public_data := jsonb_build_object('interactive_kind', v_kind, 'stage', v_stage, 'revealed', v_revealed);
    if v_revealed then
      v_public_data := v_public_data || jsonb_strip_nulls(jsonb_build_object(
        'correct_answer', p_data -> 'correct_answer', 'unit', nullif(p_data ->> 'unit', ''), 'consequence', nullif(p_data ->> 'consequence', '')
      ));
    elsif v_stage = 'wheel' then
      v_public_data := v_public_data || jsonb_strip_nulls(jsonb_build_object('wheel_selected', nullif(p_data ->> 'wheel_selected', '')));
    end if;
  elsif p_item_type = 'media' and v_kind = 'slideshow' and v_stage in ('intro', 'question', 'reveal') then
    v_count := jsonb_array_length(coalesce(p_data -> 'asset_ids', '[]'::jsonb));
    v_index := case when v_count > 0 then greatest(0, least(coalesce((p_data ->> 'current_index')::integer, 0), v_count - 1)) else 0 end;
    begin v_asset_id := nullif(p_data -> 'asset_ids' ->> v_index, '')::uuid; exception when invalid_text_representation then v_asset_id := null; end;
    v_public_data := jsonb_build_object('interactive_kind', v_kind, 'stage', v_stage, 'slide_number', case when v_count > 0 then v_index + 1 else 0 end, 'slide_count', v_count);
    if v_asset_id is not null and exists (
      select 1 from public.media_assets as asset
      where asset.id = v_asset_id and asset.event_id = p_event_id and asset.status = 'ready'
        and asset.privacy_status = 'public_allowed' and asset.moderation_status = 'approved'
    ) then v_public_data := v_public_data || jsonb_build_object('asset_ids', jsonb_build_array(v_asset_id)); end if;
  else
    return jsonb_build_object('kind', 'clear', 'session_mode', p_session_mode);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'kind', case when p_item_type = 'media' then 'media' when v_stage = 'reveal' then 'reveal' else 'question' end,
    'item_type', p_item_type, 'title', p_title, 'content', p_content,
    'data', v_public_data, 'session_mode', p_session_mode
  ));
end;
$$;

revoke all on function private.public_presentation_payload(uuid, text, text, text, jsonb, text) from public, anon, authenticated;

create or replace function public.show_event_kit_item_tx(p_event_id uuid, p_item_id uuid)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_host_id uuid; v_session_id uuid; v_session_mode text; v_item public.event_kit_items%rowtype; v_revision bigint; v_payload jsonb;
begin
  select event.host_id into v_host_id from public.events as event where event.id = p_event_id and event.host_id = (select auth.uid()) for update;
  if v_host_id is null then raise exception using errcode = 'P0002', message = 'Event not found.'; end if;
  select session.id, session.mode into v_session_id, v_session_mode from public.live_sessions as session
  where session.event_id = p_event_id and session.host_id = v_host_id and session.status = 'active' order by session.started_at desc limit 1;
  if v_session_id is null then raise exception using errcode = '55000', message = 'No active live session.'; end if;
  select item.* into v_item from public.event_kit_items as item where item.id = p_item_id and item.event_id = p_event_id and item.host_id = v_host_id
    and item.status in ('approved', 'used') and item.privacy_status = 'public_allowed' and item.do_not_use = false and item.item_type in ('interactive', 'media');
  if v_item.id is null then raise exception using errcode = 'P0002', message = 'Public interactive not found.'; end if;
  v_payload := private.public_presentation_payload(p_event_id, v_item.item_type, v_item.title, v_item.content, v_item.data, v_session_mode);
  update public.live_state set live_session_id = v_session_id, revision = revision + 1, mode = coalesce(v_payload ->> 'kind', 'clear'),
    source_event_kit_item_id = v_item.id, public_payload = v_payload
  where event_id = p_event_id and host_id = v_host_id returning revision into v_revision;
  if v_revision is null then raise exception using errcode = '55000', message = 'Live state is not initialized.'; end if;
  return v_revision;
end;
$$;

revoke all on function public.show_event_kit_item_tx(uuid, uuid) from public, anon;
grant execute on function public.show_event_kit_item_tx(uuid, uuid) to authenticated;

-- Sanitize any presentation that was live during migration without changing raw Event Kit data.
update public.live_state as state
set public_payload = private.public_presentation_payload(
  state.event_id, item.item_type, item.title, item.content, state.public_payload -> 'data', state.public_payload ->> 'session_mode'
)
from public.event_kit_items as item
where item.id = state.source_event_kit_item_id and state.public_payload <> '{}'::jsonb;

commit;
