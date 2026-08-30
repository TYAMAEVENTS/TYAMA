\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values
('11000000-0000-4000-8000-000000000001','pack3-host-a@example.invalid','',now(),'{}','{}','authenticated','authenticated'),
('11000000-0000-4000-8000-000000000002','pack3-host-b@example.invalid','',now(),'{}','{}','authenticated','authenticated');

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);
insert into public.events(id,host_id,event_type,title) values('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','birthday','Synthetic PACK 3');

insert into public.event_kit_items(id,host_id,event_id,source_type,item_type,title,content,data,status,privacy_status,is_useful,sort_order) values
('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','manual','interactive','Synthetic Who Said','Synthetic quote',jsonb_build_object('interactive_kind','who_said','generator','who_said_v3','readiness','ready','stage','question','quote','Synthetic quote','author','Hidden Host Name','asset_ids','[]'::jsonb),'approved','public_allowed',true,10),
('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','manual','interactive','Synthetic Board','Synthetic board',jsonb_build_object('interactive_kind','family_feud','generator','family_feud_v4','readiness','ready','stage','question','answers',jsonb_build_array(jsonb_build_object('label','Hidden row','points',9)),'revealed_indexes','[]'::jsonb),'approved','public_allowed',true,20),
('31000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','manual','media','Blocked media','Synthetic blocked',jsonb_build_object('interactive_kind','slideshow','readiness','ready','stage','question','asset_ids',jsonb_build_array('41000000-0000-4000-8000-000000000001')),'approved','public_allowed',true,30);

do $$
declare result jsonb; sid uuid; r1 uuid; h1 text; v bigint; item1 uuid; item2 uuid; r2 uuid;
begin
  -- 1. Stable identity, immutable revisions and snapshot.
  result:=public.prepare_show_set_tx('21000000-0000-4000-8000-000000000001',0,'51000000-0000-4000-8000-000000000001');
  if result->>'status'<>'success' then raise exception 'prepare failed: %',result; end if;
  sid:=(result->>'show_set_id')::uuid; r1:=(result->>'revision_id')::uuid; v:=(result->>'current_version')::bigint;
  select snapshot_hash into h1 from public.show_set_revisions where id=r1;
  if (select count(*) from public.show_sets where event_id='21000000-0000-4000-8000-000000000001')<>1 then raise exception 'show set identity unstable'; end if;

  -- 2. Idempotent Prepare; blocked item excluded; order/exclusion preserved.
  result:=public.prepare_show_set_tx('21000000-0000-4000-8000-000000000001',v,'51000000-0000-4000-8000-000000000002');
  if (result->>'revision_id')::uuid<>r1 then raise exception 'idempotent prepare created revision'; end if;
  if (select count(*) from public.show_set_items where show_set_id=sid)<>3 then raise exception 'prepare duplicate or missing item'; end if;
  if exists(select 1 from public.show_set_items where show_set_id=sid and source_event_kit_item_id='31000000-0000-4000-8000-000000000003' and included) then raise exception 'blocked media became runnable'; end if;
  select id into item1 from public.show_set_items where show_set_id=sid and source_event_kit_item_id='31000000-0000-4000-8000-000000000001';
  result:=public.mutate_show_set_item_tx('21000000-0000-4000-8000-000000000001',item1,'exclude',v,'51000000-0000-4000-8000-000000000003');
  if result->>'status'<>'success' then raise exception 'exclude failed'; end if;
  r2:=(result->>'revision_id')::uuid; v:=(result->>'current_version')::bigint;
  if r2=r1 or (select snapshot_hash from public.show_set_revisions where id=r1)<>h1 then raise exception 'revision immutability failed'; end if;
  result:=public.prepare_show_set_tx('21000000-0000-4000-8000-000000000001',v,'51000000-0000-4000-8000-000000000004');
  if exists(select 1 from public.show_set_items where id=item1 and included) then raise exception 'exclusion lost on reprepare'; end if;
  v:=(result->>'current_version')::bigint;
  result:=public.mutate_show_set_item_tx('21000000-0000-4000-8000-000000000001',item1,'restore',v,'51000000-0000-4000-8000-000000000005');
  v:=(result->>'current_version')::bigint;

  insert into public.event_kit_items(id,host_id,event_id,source_type,item_type,title,content,data,status,privacy_status,is_useful,sort_order) values
  ('31000000-0000-4000-8000-000000000004','11000000-0000-4000-8000-000000000001','21000000-0000-4000-8000-000000000001','manual','interactive','New ready item','Synthetic new',jsonb_build_object('interactive_kind','dilettantes','readiness','ready','stage','question','correct_answer',42),'approved','public_allowed',true,5);
  result:=public.prepare_show_set_tx('21000000-0000-4000-8000-000000000001',v,'51000000-0000-4000-8000-000000000006');
  if not exists(select 1 from public.show_set_items n where n.show_set_id=sid and n.source_event_kit_item_id='31000000-0000-4000-8000-000000000004' and n.attention_state='new' and n.host_order=(select max(host_order) from public.show_set_items where show_set_id=sid)) then raise exception 'new ready item not appended'; end if;
end $$;

-- Sentinel proves every rehearsal transition leaves Public state untouched.
insert into public.live_state(event_id,host_id,revision,mode,public_payload) values('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001',77,'clear','{"sentinel":"unchanged"}');

do $$
declare s public.show_sets%rowtype; rehearsal jsonb; live_attempt jsonb; action_result jsonb; end_result jsonb; session_id uuid; version bigint; before_item timestamptz; before_hash text; live_start jsonb; live_id uuid; reveal_result jsonb; clear_result jsonb; undo_result jsonb; token uuid; pinned uuid;
begin
  select * into s from public.show_sets where event_id='21000000-0000-4000-8000-000000000001';
  -- 4 + 5. Rehearsal isolated and no automatic mode replacement.
  rehearsal:=public.start_show_session_tx(s.event_id,'rehearsal',s.current_revision_id,repeat('a',64),'52000000-0000-4000-8000-000000000001');
  session_id:=(rehearsal->>'session_id')::uuid; version:=0;
  live_attempt:=public.start_show_session_tx(s.event_id,'live',s.current_revision_id,repeat('a',64),'52000000-0000-4000-8000-000000000002');
  if live_attempt->>'status'<>'blocked' or live_attempt->>'active_mode'<>'rehearsal' then raise exception 'automatic mode replacement allowed'; end if;
  select updated_at into before_item from public.event_kit_items where id='31000000-0000-4000-8000-000000000001';
  select snapshot_hash into before_hash from public.show_set_revisions where id=s.current_revision_id;
  action_result:=public.show_runtime_action_tx(s.event_id,session_id,'question',version,'53000000-0000-4000-8000-000000000001',null); version:=(action_result->>'runtime_version')::bigint;
  action_result:=public.show_runtime_action_tx(s.event_id,session_id,'reveal',version,'53000000-0000-4000-8000-000000000002',null); version:=(action_result->>'runtime_version')::bigint;
  if (select public_payload from public.live_state where event_id=s.event_id)<>'{"sentinel":"unchanged"}'::jsonb then raise exception 'rehearsal touched public state'; end if;
  -- 3. Runtime cannot mutate Event Kit or pinned revision.
  if (select updated_at from public.event_kit_items where id='31000000-0000-4000-8000-000000000001')<>before_item or (select snapshot_hash from public.show_set_revisions where id=s.current_revision_id)<>before_hash then raise exception 'runtime mutated canonical content'; end if;
  end_result:=public.show_runtime_action_tx(s.event_id,session_id,'end',version,'53000000-0000-4000-8000-000000000003',null);
  live_start:=public.start_show_session_tx(s.event_id,'live',s.current_revision_id,repeat('a',64),'52000000-0000-4000-8000-000000000003');
  if live_start->>'status'<>'success' then raise exception 'explicit mode switch failed'; end if;
  live_id:=(live_start->>'session_id')::uuid; pinned=s.current_revision_id; version:=0;

  -- 7. Who Said is sanitized before reveal and explicit after reveal.
  action_result:=public.show_runtime_action_tx(s.event_id,live_id,'question',version,'53000000-0000-4000-8000-000000000004',null); version:=(action_result->>'runtime_version')::bigint;
  if (select public_payload::text from public.live_state where event_id=s.event_id) like '%Hidden Host Name%' or (select public_payload from public.live_state where event_id=s.event_id)#>'{data,asset_ids}' is not null then raise exception 'hidden Who Said data leaked'; end if;
  reveal_result:=public.show_runtime_action_tx(s.event_id,live_id,'reveal',version,'53000000-0000-4000-8000-000000000005',null); version:=(reveal_result->>'runtime_version')::bigint;
  if reveal_result ? 'undo_token' or (select public_payload#>>'{data,author}' from public.live_state where event_id=s.event_id)<>'Hidden Host Name' then raise exception 'reveal boundary or non-undo rule failed'; end if;

  -- 8. Duplicate is idempotent; stale fails; clear Undo single-use and version-bound.
  if public.show_runtime_action_tx(s.event_id,live_id,'reveal',version-1,'53000000-0000-4000-8000-000000000005',null)<>reveal_result then raise exception 'idempotency receipt mismatch'; end if;
  if public.show_runtime_action_tx(s.event_id,live_id,'next',version-1,'53000000-0000-4000-8000-000000000006',null)->>'reason'<>'stale_version' then raise exception 'stale action accepted'; end if;
  clear_result:=public.show_runtime_action_tx(s.event_id,live_id,'clear',version,'53000000-0000-4000-8000-000000000007',null); token:=(clear_result->>'undo_token')::uuid; version:=(clear_result->>'runtime_version')::bigint;
  if token is null then raise exception 'safe clear did not issue undo'; end if;
  undo_result:=public.show_runtime_action_tx(s.event_id,live_id,'undo',version,'53000000-0000-4000-8000-000000000008',token); version:=(undo_result->>'runtime_version')::bigint;
  if public.show_runtime_action_tx(s.event_id,live_id,'undo',version,'53000000-0000-4000-8000-000000000009',token)->>'reason'<>'undo_unavailable' then raise exception 'undo token reused'; end if;

  -- 6. Dual gate is rechecked at execution; pin remains unchanged after new revision.
  update public.event_kit_items set privacy_status='host_only' where id='31000000-0000-4000-8000-000000000001';
  if public.show_runtime_action_tx(s.event_id,live_id,'question',version,'53000000-0000-4000-8000-000000000010',null)->>'reason'<>'public_ineligible' then raise exception 'dual gate failed'; end if;
  update public.event_kit_items set privacy_status='public_allowed' where id='31000000-0000-4000-8000-000000000001';
  perform public.prepare_show_set_tx(s.event_id,s.row_version,'51000000-0000-4000-8000-000000000007');
  if (select show_set_revision_id from public.live_sessions where id=live_id)<>pinned then raise exception 'active run repinned silently'; end if;
  end_result:=public.show_runtime_action_tx(s.event_id,live_id,'end',version,'53000000-0000-4000-8000-000000000011',null);
  if end_result ? 'undo_token' then raise exception 'end became undoable'; end if;
end $$;

-- 9. Cross-Event/session RLS and mutation isolation.
reset role;
create temporary table pack3_foreign_session(id uuid);
insert into pack3_foreign_session select id from public.live_sessions where event_id='21000000-0000-4000-8000-000000000001' order by created_at desc limit 1;
grant select on table pack3_foreign_session to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
insert into public.events(id,host_id,event_type,title) values('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','birthday','Synthetic other Event');
do $$
declare foreign_session uuid; result jsonb;
begin
  if exists(select 1 from public.show_sets where event_id='21000000-0000-4000-8000-000000000001') then raise exception 'cross-event Show Set read leaked'; end if;
  select id into foreign_session from pack3_foreign_session limit 1;
  result:=public.show_runtime_action_tx('21000000-0000-4000-8000-000000000001',foreign_session,'clear',0,'54000000-0000-4000-8000-000000000001',null);
  if result->>'status'<>'blocked' then raise exception 'cross-event mutation accepted'; end if;
end $$;

rollback;
