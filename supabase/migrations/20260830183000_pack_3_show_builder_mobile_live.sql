begin;

create table public.show_sets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  host_id uuid not null,
  current_revision_id uuid,
  row_version bigint not null default 0 check (row_version >= 0),
  prepared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id,host_id) references public.events(id,host_id),
  unique (id,event_id,host_id)
);

create table public.show_set_items (
  id uuid primary key default gen_random_uuid(),
  show_set_id uuid not null,
  event_id uuid not null,
  host_id uuid not null,
  source_event_kit_item_id uuid not null,
  host_order integer,
  included boolean not null default true,
  readiness text not null check (readiness in ('ready','needs_attention','blocked','stale')),
  public_eligible boolean not null default false,
  attention_state text not null default 'new' check (attention_state in ('new','unchanged','changed','stale')),
  blocker_reason text,
  source_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (show_set_id,event_id,host_id) references public.show_sets(id,event_id,host_id) on delete cascade,
  foreign key (source_event_kit_item_id,event_id,host_id) references public.event_kit_items(id,event_id,host_id),
  unique (show_set_id,source_event_kit_item_id),
  unique (id,show_set_id,event_id,host_id)
);

create table public.show_set_revisions (
  id uuid primary key default gen_random_uuid(),
  show_set_id uuid not null,
  event_id uuid not null,
  host_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (show_set_id,event_id,host_id) references public.show_sets(id,event_id,host_id),
  unique (show_set_id,revision_number),
  unique (id,show_set_id,event_id,host_id)
);

alter table public.show_sets add constraint show_sets_current_revision_fk
  foreign key (current_revision_id,id,event_id,host_id)
  references public.show_set_revisions(id,show_set_id,event_id,host_id);

alter table public.live_sessions
  add column show_set_id uuid,
  add column show_set_revision_id uuid,
  add column snapshot_hash text,
  add column current_position integer not null default 0,
  add column current_stage text not null default 'cover',
  add column runtime_version bigint not null default 0 check (runtime_version >= 0),
  add constraint live_sessions_show_set_revision_fk foreign key (show_set_revision_id,show_set_id,event_id,host_id)
    references public.show_set_revisions(id,show_set_id,event_id,host_id),
  add constraint live_sessions_snapshot_hash_check check (snapshot_hash is null or snapshot_hash ~ '^[0-9a-f]{64}$');

create table public.rehearsal_state (
  session_id uuid primary key,
  event_id uuid not null,
  host_id uuid not null,
  revision bigint not null default 0,
  current_position integer not null default 0,
  stage text not null default 'cover',
  private_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  foreign key (session_id,event_id,host_id) references public.live_sessions(id,event_id,host_id) on delete cascade
);

create table public.show_runtime_receipts (
  session_id uuid not null,
  idempotency_key uuid not null,
  action text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (session_id,idempotency_key),
  foreign key (session_id) references public.live_sessions(id)
);

create table public.show_undo_tokens (
  token uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  event_id uuid not null,
  host_id uuid not null,
  expected_runtime_version bigint not null,
  prior_mode text not null,
  prior_source_event_kit_item_id uuid,
  prior_payload jsonb not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (session_id,event_id,host_id) references public.live_sessions(id,event_id,host_id),
  foreign key (prior_source_event_kit_item_id,event_id,host_id) references public.event_kit_items(id,event_id,host_id)
);

alter table public.show_sets enable row level security;
alter table public.show_set_items enable row level security;
alter table public.show_set_revisions enable row level security;
alter table public.rehearsal_state enable row level security;
alter table public.show_runtime_receipts enable row level security;
alter table public.show_undo_tokens enable row level security;

create policy host_show_sets on public.show_sets for all to authenticated using (host_id=(select auth.uid())) with check (host_id=(select auth.uid()));
create policy host_show_set_items on public.show_set_items for all to authenticated using (host_id=(select auth.uid())) with check (host_id=(select auth.uid()));
create policy host_show_set_revisions on public.show_set_revisions for select to authenticated using (host_id=(select auth.uid()));
create policy host_rehearsal_state on public.rehearsal_state for select to authenticated using (host_id=(select auth.uid()));
create policy host_runtime_receipts on public.show_runtime_receipts for select to authenticated using (exists(select 1 from public.live_sessions s where s.id=session_id and s.host_id=(select auth.uid())));
create policy host_undo_tokens on public.show_undo_tokens for select to authenticated using (host_id=(select auth.uid()));

grant select,insert,update on public.show_sets,public.show_set_items to authenticated;
grant select on public.show_set_revisions,public.rehearsal_state,public.show_runtime_receipts,public.show_undo_tokens to authenticated;

create or replace function private.pack3_source_fingerprint(p_item public.event_kit_items)
returns text language sql immutable set search_path='' as $$
  select encode(extensions.digest(jsonb_build_object(
    'id',p_item.id,'type',p_item.item_type,'title',p_item.title,'content',p_item.content,
    'data',p_item.data,'source_refs',p_item.source_refs,'updated_at',p_item.updated_at
  )::text,'sha256'),'hex')
$$;

create or replace function private.pack3_host_ready(p_item public.event_kit_items)
returns boolean language sql stable set search_path='' as $$
  select p_item.item_type in ('interactive','media')
    and coalesce(p_item.data->>'interactive_kind','') in ('family_feud','who_said','dilettantes','slideshow')
    and coalesce(p_item.data->>'readiness','ready')='ready'
    and nullif(btrim(coalesce(p_item.title,p_item.content,'')),'') is not null
$$;

create or replace function private.pack3_public_eligible(p_item public.event_kit_items)
returns boolean language sql stable security definer set search_path='' as $$
  select p_item.status in ('approved','used') and p_item.privacy_status='public_allowed' and not p_item.do_not_use
    and not exists (
      select 1 from jsonb_array_elements_text(coalesce(p_item.data->'asset_ids','[]'::jsonb)) aid
      left join public.media_assets m on m.id=aid::uuid and m.event_id=p_item.event_id
      where m.id is null or m.status<>'ready' or m.privacy_status<>'public_allowed' or m.moderation_status<>'approved'
    )
$$;

create or replace function private.pack3_snapshot(p_show_set_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'show_set_item_id',ssi.id,'source_event_kit_item_id',eki.id,'order',ssi.host_order,
    'item_type',eki.item_type,'title',eki.title,'content',eki.content,'data',eki.data,
    'source_fingerprint',ssi.source_fingerprint,'host_ready',ssi.readiness='ready',
    'public_eligible',ssi.public_eligible
  ) order by ssi.host_order,ssi.id),'[]'::jsonb)
  from public.show_set_items ssi join public.event_kit_items eki on eki.id=ssi.source_event_kit_item_id
  where ssi.show_set_id=p_show_set_id and ssi.included and ssi.readiness='ready'
$$;

create or replace function private.pack3_materialize_revision(p_show_set_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.show_sets%rowtype; snap jsonb; hash text; current_hash text; rid uuid; n integer;
begin
  select * into s from public.show_sets where id=p_show_set_id for update;
  snap:=private.pack3_snapshot(s.id); hash:=encode(extensions.digest(snap::text,'sha256'),'hex');
  select snapshot_hash into current_hash from public.show_set_revisions where id=s.current_revision_id;
  if current_hash=hash then return s.current_revision_id; end if;
  select coalesce(max(revision_number),0)+1 into n from public.show_set_revisions where show_set_id=s.id;
  insert into public.show_set_revisions(show_set_id,event_id,host_id,revision_number,snapshot_hash,snapshot)
  values(s.id,s.event_id,s.host_id,n,hash,snap) returning id into rid;
  update public.show_sets set current_revision_id=rid,row_version=row_version+1,updated_at=now() where id=s.id;
  return rid;
end $$;

create or replace function public.prepare_show_set_tx(p_event_id uuid,p_expected_version bigint,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare host uuid; sid uuid; current_version bigint; max_order integer; item public.event_kit_items%rowtype; fp text; ready boolean; eligible boolean; oldfp text; rid uuid; result jsonb;
begin
  select e.host_id into host from public.events e where e.id=p_event_id and e.host_id=(select auth.uid()) for update;
  if host is null then raise exception 'Event not found'; end if;
  insert into public.show_sets(event_id,host_id) values(p_event_id,host) on conflict(event_id) do nothing;
  select id,row_version into sid,current_version from public.show_sets where event_id=p_event_id and host_id=host for update;
  if p_expected_version is not null and current_version<>p_expected_version then return jsonb_build_object('status','blocked','reason','stale_version','current_version',current_version); end if;
  select coalesce(max(host_order),0) into max_order from public.show_set_items where show_set_id=sid;
  for item in select * from public.event_kit_items where event_id=p_event_id and host_id=host and item_type in ('interactive','media') order by sort_order,created_at,id loop
    fp:=private.pack3_source_fingerprint(item); ready:=private.pack3_host_ready(item); eligible:=private.pack3_public_eligible(item);
    select source_fingerprint into oldfp from public.show_set_items where show_set_id=sid and source_event_kit_item_id=item.id;
    if oldfp is null then
      if ready and eligible then max_order:=max_order+10; end if;
      insert into public.show_set_items(show_set_id,event_id,host_id,source_event_kit_item_id,host_order,included,readiness,public_eligible,attention_state,blocker_reason,source_fingerprint)
      values(sid,p_event_id,host,item.id,case when ready and eligible then max_order end,ready and eligible,case when not ready then 'needs_attention' when not eligible then 'blocked' else 'ready' end,eligible,'new',case when not ready then 'Потрібна підготовка контенту' when not eligible then 'Публічний доступ не дозволено' end,fp);
    else
      if ready and eligible and exists(select 1 from public.show_set_items where show_set_id=sid and source_event_kit_item_id=item.id and host_order is null) then max_order:=max_order+10; end if;
      update public.show_set_items set
        readiness=case when not ready then 'needs_attention' when not eligible then 'blocked' else 'ready' end,
        public_eligible=eligible,attention_state=case when oldfp<>fp then 'changed' else 'unchanged' end,
        blocker_reason=case when not ready then 'Потрібна підготовка контенту' when not eligible then 'Публічний доступ не дозволено' end,
        source_fingerprint=fp,updated_at=now(),
        included=case when not ready or not eligible then false else included end,
        host_order=case when ready and eligible and host_order is null then max_order else host_order end
      where show_set_id=sid and source_event_kit_item_id=item.id;
    end if;
  end loop;
  update public.show_set_items ssi set readiness='stale',included=false,attention_state='stale',blocker_reason='Джерело недоступне',updated_at=now()
  where ssi.show_set_id=sid and not exists(select 1 from public.event_kit_items eki where eki.id=ssi.source_event_kit_item_id and eki.event_id=p_event_id);
  update public.show_sets set prepared_at=now() where id=sid;
  rid:=private.pack3_materialize_revision(sid);
  select jsonb_build_object('status','success','show_set_id',sid,'revision_id',rid,'current_version',row_version) into result from public.show_sets where id=sid;
  return result;
end $$;

create or replace function public.mutate_show_set_item_tx(p_event_id uuid,p_show_set_item_id uuid,p_action text,p_expected_version bigint,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.show_sets%rowtype; target public.show_set_items%rowtype; other public.show_set_items%rowtype; tmp integer; rid uuid;
begin
  select ss.* into s from public.show_sets ss where ss.event_id=p_event_id and ss.host_id=(select auth.uid()) for update;
  if not found then raise exception 'Show Set not found'; end if;
  if s.row_version<>p_expected_version then return jsonb_build_object('status','blocked','reason','stale_version','current_version',s.row_version); end if;
  select * into target from public.show_set_items where id=p_show_set_item_id and show_set_id=s.id for update;
  if not found then raise exception 'Show item not found'; end if;
  if p_action='exclude' then update public.show_set_items set included=false,updated_at=now() where id=target.id;
  elsif p_action in ('include','restore') then
    if target.readiness<>'ready' or not target.public_eligible then return jsonb_build_object('status','blocked','reason','item_not_runnable','current_version',s.row_version); end if;
    update public.show_set_items set included=true,host_order=coalesce(host_order,(select coalesce(max(host_order),0)+10 from public.show_set_items where show_set_id=s.id)),attention_state='unchanged',updated_at=now() where id=target.id;
  elsif p_action in ('up','down') then
    select * into other from public.show_set_items where show_set_id=s.id and included and readiness='ready' and (case when p_action='up' then host_order<target.host_order else host_order>target.host_order end) order by case when p_action='up' then -host_order else host_order end limit 1 for update;
    if found then tmp:=target.host_order; update public.show_set_items set host_order=-2147483648 where id=target.id; update public.show_set_items set host_order=tmp where id=other.id; update public.show_set_items set host_order=other.host_order where id=target.id; end if;
  else raise exception 'Invalid Show Set action'; end if;
  rid:=private.pack3_materialize_revision(s.id);
  select * into s from public.show_sets where id=s.id;
  return jsonb_build_object('status','success','revision_id',rid,'current_version',s.row_version);
end $$;

create or replace function public.start_show_session_tx(p_event_id uuid,p_mode text,p_revision_id uuid,p_public_screen_token_hash text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare host uuid; s public.show_sets%rowtype; r public.show_set_revisions%rowtype; active public.live_sessions%rowtype; session_id uuid;
begin
  if p_mode not in ('rehearsal','live') then raise exception 'Invalid mode'; end if;
  select e.host_id into host from public.events e where e.id=p_event_id and e.host_id=(select auth.uid()) for update;
  if host is null then raise exception 'Event not found'; end if;
  select * into active from public.live_sessions where event_id=p_event_id and status='active' order by started_at desc limit 1;
  if found then return jsonb_build_object('status','blocked','reason','active_session','active_mode',active.mode,'session_id',active.id); end if;
  select * into s from public.show_sets where event_id=p_event_id and host_id=host;
  select * into r from public.show_set_revisions where id=p_revision_id and show_set_id=s.id;
  if not found or s.current_revision_id<>r.id or jsonb_array_length(r.snapshot)=0 then return jsonb_build_object('status','blocked','reason','show_set_not_ready'); end if;
  insert into public.live_sessions(host_id,event_id,mode,status,show_set_id,show_set_revision_id,snapshot_hash,current_position,current_stage,runtime_version)
  values(host,p_event_id,p_mode,'active',s.id,r.id,r.snapshot_hash,0,'cover',0) returning id into session_id;
  if p_mode='rehearsal' then
    insert into public.rehearsal_state(session_id,event_id,host_id,private_payload) values(session_id,p_event_id,host,jsonb_build_object('kind','cover','private',true));
  else
    insert into public.live_state(event_id,host_id,live_session_id,revision,mode,source_event_kit_item_id,public_payload)
    values(p_event_id,host,session_id,1,'clear',null,jsonb_build_object('kind','clear','session_mode','live'))
    on conflict(event_id) do update set live_session_id=session_id,revision=public.live_state.revision+1,mode='clear',source_event_kit_item_id=null,public_payload=excluded.public_payload;
    update public.events set public_screen_enabled=true,public_screen_token_hash=p_public_screen_token_hash,status='live' where id=p_event_id;
  end if;
  return jsonb_build_object('status','success','session_id',session_id,'mode',p_mode,'runtime_version',0,'snapshot_hash',r.snapshot_hash);
end $$;

create or replace function public.show_runtime_action_tx(p_event_id uuid,p_session_id uuid,p_action text,p_expected_version bigint,p_idempotency_key uuid,p_undo_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sess public.live_sessions%rowtype; rev public.show_set_revisions%rowtype; receipt jsonb; count_items int; next_pos int; entry jsonb; item public.event_kit_items%rowtype; d jsonb; payload jsonb; live public.live_state%rowtype; token uuid; target_mode text; target_source uuid;
begin
  select result into receipt from public.show_runtime_receipts where session_id=p_session_id and idempotency_key=p_idempotency_key; if receipt is not null then return receipt; end if;
  select * into sess from public.live_sessions where id=p_session_id and event_id=p_event_id and host_id=(select auth.uid()) for update;
  if not found or sess.status<>'active' then return jsonb_build_object('status','blocked','reason','session_inactive'); end if;
  if sess.runtime_version<>p_expected_version then return jsonb_build_object('status','blocked','reason','stale_version','current_version',sess.runtime_version); end if;
  select * into rev from public.show_set_revisions where id=sess.show_set_revision_id and snapshot_hash=sess.snapshot_hash;
  if not found then return jsonb_build_object('status','blocked','reason','revision_mismatch'); end if;
  count_items:=jsonb_array_length(rev.snapshot); next_pos:=sess.current_position;
  if p_action='next' then next_pos:=least(sess.current_position+1,greatest(count_items-1,0));
  elsif p_action='previous' then next_pos:=greatest(sess.current_position-1,0);
  elsif p_action not in ('cover','question','reveal','slideshow_next','clear','emergency_cover','undo','end') then raise exception 'Invalid runtime action'; end if;
  if p_action='end' then
    update public.live_sessions set status='ended',ended_at=now(),runtime_version=runtime_version+1 where id=sess.id;
    if sess.mode='live' then update public.live_state set live_session_id=null,revision=revision+1,mode='clear',source_event_kit_item_id=null,public_payload=jsonb_build_object('kind','clear') where event_id=p_event_id; update public.events set status='ready' where id=p_event_id; end if;
    receipt:=jsonb_build_object('status','success','ended',true,'runtime_version',sess.runtime_version+1);
  elsif p_action='undo' then
    select u.prior_mode,u.prior_source_event_kit_item_id,u.prior_payload
      into target_mode,target_source,payload
      from public.show_undo_tokens u
      where u.token=p_undo_token
        and u.session_id=sess.id
        and u.expected_runtime_version=sess.runtime_version
        and u.used_at is null
      for update;
    if not found then return jsonb_build_object('status','blocked','reason','undo_unavailable','current_version',sess.runtime_version); end if;
    update public.show_undo_tokens u set used_at=now() where u.token=p_undo_token;
    if sess.mode='live' then update public.live_state set revision=revision+1,mode=target_mode,source_event_kit_item_id=target_source,public_payload=payload where event_id=p_event_id;
    else update public.rehearsal_state set revision=revision+1,stage=target_mode,private_payload=payload,updated_at=now() where session_id=sess.id; end if;
    update public.live_sessions set runtime_version=runtime_version+1 where id=sess.id;
    receipt:=jsonb_build_object('status','success','runtime_version',sess.runtime_version+1,'undoable',false);
  else
    if p_action in ('clear','emergency_cover') then
      if sess.mode='live' then select * into live from public.live_state where event_id=p_event_id for update; target_mode:=live.mode; target_source:=live.source_event_kit_item_id; payload:=live.public_payload;
      else select stage,private_payload into target_mode,payload from public.rehearsal_state where session_id=sess.id for update; target_source:=null; end if;
      insert into public.show_undo_tokens(session_id,event_id,host_id,expected_runtime_version,prior_mode,prior_source_event_kit_item_id,prior_payload)
      values(sess.id,p_event_id,sess.host_id,sess.runtime_version+1,target_mode,target_source,coalesce(payload,'{}')) returning show_undo_tokens.token into token;
      payload:=jsonb_build_object('kind','clear','session_mode',sess.mode,'emergency',p_action='emergency_cover'); target_mode:='clear'; target_source:=null;
    else
      entry:=rev.snapshot->next_pos; if entry is null then return jsonb_build_object('status','blocked','reason','item_unavailable'); end if;
      select * into item from public.event_kit_items where id=(entry->>'source_event_kit_item_id')::uuid and event_id=p_event_id;
      if not found or not private.pack3_host_ready(item) then return jsonb_build_object('status','blocked','reason','host_not_ready'); end if;
      d:=entry->'data';
      if p_action in ('next','previous','cover') then d:=d||jsonb_build_object('stage','intro','revealed',false);
      elsif p_action='question' then d:=d||jsonb_build_object('stage','question','revealed',false);
      elsif p_action='reveal' then d:=d||jsonb_build_object('stage','reveal','revealed',true);
      elsif p_action='slideshow_next' then d:=d||jsonb_build_object('stage','question','current_index',least(coalesce((d->>'current_index')::int,0)+1,greatest(jsonb_array_length(coalesce(d->'asset_ids','[]'))-1,0))); end if;
      target_source:=item.id;
      if sess.mode='live' then
        if not private.pack3_public_eligible(item) then return jsonb_build_object('status','blocked','reason','public_ineligible'); end if;
        payload:=private.public_presentation_payload(p_event_id,item.item_type,item.title,item.content,d,'live'); target_mode:=coalesce(payload->>'kind','clear');
      else payload:=jsonb_build_object('kind','rehearsal','item_type',item.item_type,'title',item.title,'content',item.content,'data',d); target_mode:=coalesce(d->>'stage','intro'); end if;
    end if;
    if sess.mode='live' then update public.live_state set revision=revision+1,mode=target_mode,source_event_kit_item_id=target_source,public_payload=payload where event_id=p_event_id;
    else update public.rehearsal_state set revision=revision+1,current_position=next_pos,stage=target_mode,private_payload=payload,updated_at=now() where session_id=sess.id; end if;
    update public.live_sessions set current_position=next_pos,current_stage=target_mode,runtime_version=runtime_version+1 where id=sess.id;
    receipt:=jsonb_strip_nulls(jsonb_build_object('status','success','runtime_version',sess.runtime_version+1,'position',next_pos,'stage',target_mode,'undo_token',token));
  end if;
  insert into public.show_runtime_receipts(session_id,idempotency_key,action,result) values(sess.id,p_idempotency_key,p_action,receipt);
  return receipt;
end $$;

revoke all on function private.pack3_source_fingerprint(public.event_kit_items),private.pack3_host_ready(public.event_kit_items),private.pack3_public_eligible(public.event_kit_items),private.pack3_snapshot(uuid),private.pack3_materialize_revision(uuid) from public,anon,authenticated;
revoke all on function public.prepare_show_set_tx(uuid,bigint,uuid),public.mutate_show_set_item_tx(uuid,uuid,text,bigint,uuid),public.start_show_session_tx(uuid,text,uuid,text,uuid),public.show_runtime_action_tx(uuid,uuid,text,bigint,uuid,uuid) from public,anon;
grant execute on function public.prepare_show_set_tx(uuid,bigint,uuid),public.mutate_show_set_item_tx(uuid,uuid,text,bigint,uuid),public.start_show_session_tx(uuid,text,uuid,text,uuid),public.show_runtime_action_tx(uuid,uuid,text,bigint,uuid,uuid) to authenticated;

commit;
