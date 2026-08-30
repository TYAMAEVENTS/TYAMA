begin;

alter table public.questionnaires add column if not exists published_revision_id uuid;
alter table public.questionnaires add column if not exists draft_revision_id uuid;
alter table public.questionnaires drop constraint if exists questionnaires_status_check;
alter table public.questionnaires add constraint questionnaires_status_check check (status in ('draft','published','paused','closed'));

create table public.questionnaire_revisions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null,
  event_id uuid not null,
  host_id uuid not null,
  version integer not null check (version > 0),
  state text not null check (state in ('draft','published','superseded')),
  source_revision_id uuid references public.questionnaire_revisions(id),
  row_version bigint not null default 1 check (row_version > 0),
  source_set_hash text,
  host_public_source_authorization jsonb,
  host_authorized_at timestamptz,
  host_authorized_by uuid,
  policy_version text not null default 'pack2-v1',
  created_at timestamptz not null default now(),
  published_at timestamptz,
  foreign key (questionnaire_id,event_id,host_id) references public.questionnaires(id,event_id,host_id),
  unique (questionnaire_id,version),
  unique (id,questionnaire_id,event_id,host_id)
);
create unique index questionnaire_one_published_revision on public.questionnaire_revisions(questionnaire_id) where state='published';
create unique index questionnaire_one_draft_revision on public.questionnaire_revisions(questionnaire_id) where state='draft';

create table public.questionnaire_revision_questions (
  revision_id uuid not null,
  questionnaire_id uuid not null,
  event_id uuid not null,
  host_id uuid not null,
  question_id uuid not null,
  sort_order integer not null,
  is_required boolean not null,
  is_active boolean not null default true,
  primary key (revision_id,question_id),
  foreign key (revision_id,questionnaire_id,event_id,host_id) references public.questionnaire_revisions(id,questionnaire_id,event_id,host_id) on delete cascade,
  foreign key (question_id,event_id,host_id) references public.questions(id,event_id,host_id),
  unique (revision_id,sort_order)
);

alter table public.questionnaires
  add constraint questionnaires_published_revision_fk foreign key (published_revision_id,id,event_id,host_id) references public.questionnaire_revisions(id,questionnaire_id,event_id,host_id),
  add constraint questionnaires_draft_revision_fk foreign key (draft_revision_id,id,event_id,host_id) references public.questionnaire_revisions(id,questionnaire_id,event_id,host_id);

alter table public.submissions add column if not exists questionnaire_revision_id uuid;
alter table public.submissions add column if not exists public_use_consent_state text not null default 'not_requested' check (public_use_consent_state in ('not_requested','granted','declined'));
alter table public.submissions add column if not exists public_use_consent_version text;
alter table public.submissions add column if not exists public_use_source_set_hash text;
alter table public.submissions add column if not exists public_use_consented_at timestamptz;
alter table public.submissions add constraint submissions_revision_fk foreign key (questionnaire_revision_id,questionnaire_id,event_id,host_id) references public.questionnaire_revisions(id,questionnaire_id,event_id,host_id);

create table public.public_submission_drafts (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  event_id uuid not null,
  questionnaire_id uuid not null,
  revision_id uuid not null,
  submission_id uuid not null unique,
  capability_hash text not null unique check (capability_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key_hash text not null unique check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'started' check (state in ('started','uploading','ready_to_finalize','finalized','expired','abandoned')),
  expires_at timestamptz not null default (now()+interval '7 days'),
  last_active_at timestamptz not null default now(),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (revision_id,questionnaire_id,event_id,host_id) references public.questionnaire_revisions(id,questionnaire_id,event_id,host_id),
  foreign key (submission_id,event_id,host_id) references public.submissions(id,event_id,host_id)
);

create table public.questionnaire_mutation_receipts (
  questionnaire_id uuid not null references public.questionnaires(id),
  idempotency_key uuid not null,
  operation text not null,
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key(questionnaire_id,idempotency_key,operation)
);

alter table public.questionnaire_revisions enable row level security;
alter table public.questionnaire_revision_questions enable row level security;
alter table public.public_submission_drafts enable row level security;
alter table public.questionnaire_mutation_receipts enable row level security;
create policy host_revision_access on public.questionnaire_revisions for all to authenticated using ((select auth.uid())=host_id) with check ((select auth.uid())=host_id);
create policy host_revision_question_access on public.questionnaire_revision_questions for all to authenticated using ((select auth.uid())=host_id) with check ((select auth.uid())=host_id);
create policy host_draft_read on public.public_submission_drafts for select to authenticated using ((select auth.uid())=host_id);
create policy host_receipt_read on public.questionnaire_mutation_receipts for select to authenticated using (exists(select 1 from public.questionnaires q where q.id=questionnaire_id and q.host_id=(select auth.uid())));

create or replace function private.pack2_validate_settings(p_type text,p_settings jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare v_options jsonb; v_kind jsonb;
begin
  if jsonb_typeof(coalesce(p_settings,'{}')) <> 'object' then return false; end if;
  if p_settings ? 'content_intents' and (jsonb_typeof(p_settings->'content_intents') <> 'array' or exists(select 1 from jsonb_array_elements_text(p_settings->'content_intents') x where x not in ('family_feud','who_said','story','media','trivia'))) then return false; end if;
  v_options:=p_settings->'options';
  if p_type in ('single_select','multi_select') and (jsonb_typeof(v_options)<>'array' or jsonb_array_length(v_options) not between 2 and 20 or (select count(distinct value) from jsonb_array_elements_text(v_options))<>jsonb_array_length(v_options)) then return false; end if;
  if p_type not in ('single_select','multi_select') and v_options is not null then return false; end if;
  if p_type='media' then
    v_kind:=p_settings#>'{media_constraints,allowed_kinds}';
    if jsonb_typeof(v_kind)<>'array' or exists(select 1 from jsonb_array_elements_text(v_kind) x where x not in ('image','video','audio')) or coalesce((p_settings#>>'{media_constraints,max_files}')::int,0) not between 1 and 9 then return false; end if;
  end if;
  return true;
exception when others then return false;
end $$;

alter table public.questions add constraint questions_pack2_settings_valid check (private.pack2_validate_settings(type,settings)) not valid;

do $$
declare q public.questionnaires%rowtype; r_id uuid; v integer;
begin
  for q in select * from public.questionnaires order by created_at,id loop
    if q.published_revision_id is not null or q.draft_revision_id is not null then continue; end if;
    v:=1;
    insert into public.questionnaire_revisions(questionnaire_id,event_id,host_id,version,state,published_at)
    values(q.id,q.event_id,q.host_id,v,case when q.status='published' then 'published' else 'draft' end,case when q.status='published' then q.updated_at end)
    returning id into r_id;
    insert into public.questionnaire_revision_questions(revision_id,questionnaire_id,event_id,host_id,question_id,sort_order,is_required,is_active)
    select r_id,q.id,q.event_id,q.host_id,x.id,x.sort_order,x.is_required,x.is_active from public.questions x where x.questionnaire_id=q.id;
    if q.status='published' then update public.questionnaires set published_revision_id=r_id where id=q.id; else update public.questionnaires set draft_revision_id=r_id where id=q.id; end if;
  end loop;
  update public.submissions s set questionnaire_revision_id=q.published_revision_id from public.questionnaires q where q.id=s.questionnaire_id and s.questionnaire_revision_id is null and q.published_revision_id is not null;
end $$;

create or replace function private.reject_published_question_mutation() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.questionnaire_revision_questions rq join public.questionnaire_revisions r on r.id=rq.revision_id where rq.question_id=old.id and r.state in ('published','superseded')) then
    raise exception using errcode='55000',message='Published question definitions are immutable; use copy-on-write.';
  end if;
  return new;
end $$;
drop trigger if exists questions_immutable_after_publish on public.questions;
create trigger questions_immutable_after_publish before update or delete on public.questions for each row execute function private.reject_published_question_mutation();

create or replace function private.pack2_source_set(p_revision_id uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('semantic_key',q.settings->>'semantic_key','module_key',q.settings->>'module_key','intents',q.settings->'content_intents','policy',q.settings->>'public_source_policy') order by rq.sort_order),'[]'::jsonb)
 from public.questionnaire_revision_questions rq join public.questions q on q.id=rq.question_id where rq.revision_id=p_revision_id and rq.is_active and q.settings->>'public_source_policy'='automatic_with_consent';
$$;

create or replace function public.ensure_questionnaire_draft_tx(p_questionnaire_id uuid,p_expected_published_revision_id uuid,p_expected_row_version bigint,p_idempotency_key uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.questionnaires%rowtype; source public.questionnaire_revisions%rowtype; draft_id uuid; receipt jsonb;
begin
  select r.receipt into receipt from public.questionnaire_mutation_receipts r where r.questionnaire_id=p_questionnaire_id and r.idempotency_key=p_idempotency_key and r.operation='ensure_draft'; if receipt is not null then return receipt; end if;
  select * into q from public.questionnaires where id=p_questionnaire_id and host_id=(select auth.uid()) for update; if not found then raise exception 'Questionnaire not found'; end if;
  if q.draft_revision_id is not null then select jsonb_build_object('draft_revision_id',q.draft_revision_id,'created',false) into receipt; else
    if q.published_revision_id is distinct from p_expected_published_revision_id then raise exception using errcode='40001',message='Published revision conflict'; end if;
    select * into source from public.questionnaire_revisions where id=q.published_revision_id and row_version=p_expected_row_version; if not found then raise exception using errcode='40001',message='Revision version conflict'; end if;
    insert into public.questionnaire_revisions(questionnaire_id,event_id,host_id,version,state,source_revision_id) values(q.id,q.event_id,q.host_id,source.version+1,'draft',source.id) returning id into draft_id;
    insert into public.questionnaire_revision_questions select draft_id,questionnaire_id,event_id,host_id,question_id,sort_order,is_required,is_active from public.questionnaire_revision_questions where revision_id=source.id;
    update public.questionnaires set draft_revision_id=draft_id where id=q.id;
    receipt:=jsonb_build_object('draft_revision_id',draft_id,'created',true);
  end if;
  insert into public.questionnaire_mutation_receipts values(p_questionnaire_id,p_idempotency_key,'ensure_draft',receipt,now()); return receipt;
end $$;

create or replace function public.update_draft_question_tx(p_questionnaire_id uuid,p_draft_revision_id uuid,p_question_id uuid,p_expected_row_version bigint,p_idempotency_key uuid,p_prompt text,p_help_text text,p_is_required boolean,p_is_active boolean,p_settings jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.questionnaire_revisions%rowtype; oldq public.questions%rowtype; new_id uuid; receipt jsonb; drift boolean;
begin
 select x.receipt into receipt from public.questionnaire_mutation_receipts x where x.questionnaire_id=p_questionnaire_id and x.idempotency_key=p_idempotency_key and x.operation='update_question'; if receipt is not null then return receipt; end if;
 select * into r from public.questionnaire_revisions where id=p_draft_revision_id and questionnaire_id=p_questionnaire_id and host_id=(select auth.uid()) and state='draft' for update; if not found or r.row_version<>p_expected_row_version then raise exception using errcode='40001',message='Draft version conflict'; end if;
 select q.* into oldq from public.questions q join public.questionnaire_revision_questions rq on rq.question_id=q.id where rq.revision_id=r.id and q.id=p_question_id; if not found then raise exception 'Question not in draft'; end if;
 drift:=oldq.prompt is distinct from btrim(p_prompt) and oldq.settings->>'public_source_policy'='automatic_with_consent';
 insert into public.questions(host_id,event_id,questionnaire_id,type,prompt,help_text,is_required,is_active,sort_order,settings,default_privacy)
 values(oldq.host_id,oldq.event_id,oldq.questionnaire_id,oldq.type,btrim(p_prompt),nullif(btrim(p_help_text),''),p_is_required,p_is_active,oldq.sort_order,case when drift then jsonb_build_object('schema_version',1,'semantic_key','custom.'||gen_random_uuid(),'content_intents',jsonb_build_array(),'public_source_policy','review_required') else p_settings end,case when drift then 'review_required' else oldq.default_privacy end) returning id into new_id;
 update public.questionnaire_revision_questions set question_id=new_id,is_required=p_is_required,is_active=p_is_active where revision_id=r.id and question_id=oldq.id;
 update public.questionnaire_revisions set row_version=row_version+1 where id=r.id;
 receipt:=jsonb_build_object('question_id',new_id,'row_version',r.row_version+1,'semantic_drift',drift); insert into public.questionnaire_mutation_receipts values(p_questionnaire_id,p_idempotency_key,'update_question',receipt,now()); return receipt;
end $$;

create or replace function public.authorize_questionnaire_sources_tx(p_questionnaire_id uuid,p_draft_revision_id uuid,p_expected_row_version bigint,p_idempotency_key uuid,p_policy_version text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare sources jsonb; hash text; receipt jsonb;
begin
 select r.receipt into receipt from public.questionnaire_mutation_receipts r where r.questionnaire_id=p_questionnaire_id and r.idempotency_key=p_idempotency_key and r.operation='authorize'; if receipt is not null then return receipt; end if;
 sources:=private.pack2_source_set(p_draft_revision_id); hash:=encode(extensions.digest(sources::text,'sha256'),'hex');
 update public.questionnaire_revisions set source_set_hash=hash,host_public_source_authorization=sources,host_authorized_at=now(),host_authorized_by=(select auth.uid()),policy_version=p_policy_version,row_version=row_version+1 where id=p_draft_revision_id and questionnaire_id=p_questionnaire_id and host_id=(select auth.uid()) and state='draft' and row_version=p_expected_row_version;
 if not found then raise exception using errcode='40001',message='Draft version conflict'; end if;
 receipt:=jsonb_build_object('source_set_hash',hash,'row_version',p_expected_row_version+1); insert into public.questionnaire_mutation_receipts values(p_questionnaire_id,p_idempotency_key,'authorize',receipt,now()); return receipt;
end $$;

create or replace function public.publish_questionnaire_revision_tx(p_questionnaire_id uuid,p_expected_published_revision_id uuid,p_draft_revision_id uuid,p_expected_row_version bigint,p_idempotency_key uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.questionnaires%rowtype; d public.questionnaire_revisions%rowtype; receipt jsonb;
begin
 select r.receipt into receipt from public.questionnaire_mutation_receipts r where r.questionnaire_id=p_questionnaire_id and r.idempotency_key=p_idempotency_key and r.operation='publish'; if receipt is not null then return receipt; end if;
 select * into q from public.questionnaires where id=p_questionnaire_id and host_id=(select auth.uid()) for update; if not found or q.published_revision_id is distinct from p_expected_published_revision_id or q.draft_revision_id is distinct from p_draft_revision_id then raise exception using errcode='40001',message='Questionnaire revision conflict'; end if;
 select * into d from public.questionnaire_revisions where id=p_draft_revision_id and state='draft' and row_version=p_expected_row_version for update; if not found then raise exception using errcode='40001',message='Draft version conflict'; end if;
 if not exists(select 1 from public.questionnaire_revision_questions where revision_id=d.id and is_active) or d.host_authorized_at is null or d.source_set_hash is distinct from encode(extensions.digest(private.pack2_source_set(d.id)::text,'sha256'),'hex') then raise exception using errcode='22023',message='Revision is not ready or authorization is stale'; end if;
 update public.questionnaire_revisions set state='superseded' where id=q.published_revision_id;
 update public.questionnaire_revisions set state='published',published_at=now(),row_version=row_version+1 where id=d.id;
 update public.questionnaires set published_revision_id=d.id,draft_revision_id=null,status='published' where id=q.id;
 receipt:=jsonb_build_object('published_revision_id',d.id,'version',d.version); insert into public.questionnaire_mutation_receipts values(q.id,p_idempotency_key,'publish',receipt,now()); return receipt;
end $$;

create or replace function private.begin_public_submission_draft(p_token_hash text,p_idempotency_hash text,p_capability_hash text,p_display_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.questionnaires%rowtype; r public.questionnaire_revisions%rowtype; existing public.public_submission_drafts%rowtype; respondent uuid; submission uuid; draft uuid;
begin
 if p_token_hash!~'^[0-9a-f]{64}$' or p_idempotency_hash!~'^[0-9a-f]{64}$' or p_capability_hash!~'^[0-9a-f]{64}$' then raise exception 'Invalid capability'; end if;
 select * into existing from public.public_submission_drafts where idempotency_key_hash=p_idempotency_hash; if found then return jsonb_build_object('draft_id',existing.id,'submission_id',existing.submission_id,'revision_id',existing.revision_id,'expires_at',existing.expires_at); end if;
 select * into q from public.questionnaires where public_token_hash=p_token_hash and status='published' and published_revision_id is not null; if not found then raise exception 'Questionnaire unavailable'; end if;
 select * into r from public.questionnaire_revisions where id=q.published_revision_id and state='published';
 insert into public.respondents(host_id,event_id,display_name) values(q.host_id,q.event_id,btrim(p_display_name)) returning id into respondent;
 insert into public.submissions(host_id,event_id,questionnaire_id,questionnaire_revision_id,respondent_id,status,idempotency_key_hash) values(q.host_id,q.event_id,q.id,r.id,respondent,'draft',p_idempotency_hash) returning id into submission;
 insert into public.public_submission_drafts(host_id,event_id,questionnaire_id,revision_id,submission_id,capability_hash,idempotency_key_hash) values(q.host_id,q.event_id,q.id,r.id,submission,p_capability_hash,p_idempotency_hash) returning id into draft;
 return jsonb_build_object('draft_id',draft,'submission_id',submission,'revision_id',r.id,'expires_at',now()+interval '7 days');
end $$;

create or replace function private.save_public_submission_draft(p_capability_hash text,p_answers jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.public_submission_drafts%rowtype; item jsonb; q public.questions%rowtype; qid uuid; txt text; val jsonb;
begin
 select * into d from public.public_submission_drafts where capability_hash=p_capability_hash and state in ('started','uploading','ready_to_finalize') and expires_at>now() for update; if not found then raise exception 'Draft capability unavailable'; end if;
 if jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)>100 then raise exception 'Invalid answers'; end if;
 delete from public.answers where submission_id=d.submission_id and not exists(select 1 from public.media_assets m where m.answer_id=answers.id);
 for item in select value from jsonb_array_elements(p_answers) loop
   qid:=(item->>'question_id')::uuid; select x.* into q from public.questions x join public.questionnaire_revision_questions rq on rq.question_id=x.id where rq.revision_id=d.revision_id and rq.question_id=qid and rq.is_active; if not found or q.type='media' then raise exception 'Question not in revision'; end if;
   txt:=nullif(btrim(item->>'answer_text'),''); val:=nullif(item->'answer_json','null'::jsonb);
   if q.type='short_text' and (txt is null or char_length(txt)>500) then raise exception 'Invalid short text'; elsif q.type='long_text' and (txt is null or char_length(txt)>10000) then raise exception 'Invalid long text'; elsif q.type='boolean' and jsonb_typeof(val)<>'boolean' then raise exception 'Invalid boolean'; elsif q.type='single_select' and (jsonb_typeof(val)<>'string' or not (q.settings->'options' @> jsonb_build_array(val))) then raise exception 'Invalid select'; elsif q.type='multi_select' and (jsonb_typeof(val)<>'array' or jsonb_array_length(val)>20 or exists(select 1 from jsonb_array_elements_text(val) x where not(q.settings->'options' @> jsonb_build_array(x)))) then raise exception 'Invalid multi select'; end if;
   insert into public.answers(host_id,event_id,submission_id,question_id,answer_text,answer_json,privacy_status,moderation_status) values(d.host_id,d.event_id,d.submission_id,q.id,txt,val,'review_required','pending');
 end loop;
 update public.public_submission_drafts set state='ready_to_finalize',last_active_at=now(),expires_at=now()+interval '7 days' where id=d.id; return true;
end $$;

create or replace function private.finalize_public_submission_draft(p_capability_hash text,p_consent boolean,p_consent_version text,p_source_set_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.public_submission_drafts%rowtype; r public.questionnaire_revisions%rowtype; missing boolean;
begin
 select * into d from public.public_submission_drafts where capability_hash=p_capability_hash for update; if not found then raise exception 'Draft unavailable'; end if;
 if d.state='finalized' then return jsonb_build_object('submission_id',d.submission_id,'finalized',true); end if;
 if d.state not in ('ready_to_finalize','uploading') or d.expires_at<=now() then raise exception 'Draft unavailable'; end if;
 select * into r from public.questionnaire_revisions where id=d.revision_id;
 select exists(select 1 from public.questionnaire_revision_questions rq join public.questions q on q.id=rq.question_id where rq.revision_id=d.revision_id and rq.is_active and rq.is_required and ((q.type='media' and not exists(select 1 from public.media_assets m join public.answers a on a.id=m.answer_id where a.submission_id=d.submission_id and a.question_id=q.id and m.status='ready')) or (q.type<>'media' and not exists(select 1 from public.answers a where a.submission_id=d.submission_id and a.question_id=q.id)))) into missing;
 if missing or exists(select 1 from public.media_assets m where m.submission_id=d.submission_id and m.status='pending') then raise exception 'Submission is incomplete'; end if;
 update public.answers a set privacy_status=case when q.default_privacy='host_only' then 'host_only' when q.settings->>'public_source_policy'='automatic_with_consent' and p_consent and r.host_authorized_at is not null and r.source_set_hash=p_source_set_hash then 'public_allowed' else 'review_required' end, moderation_status=case when q.default_privacy='host_only' then 'approved' when q.settings->>'public_source_policy'='automatic_with_consent' and p_consent and r.host_authorized_at is not null and r.source_set_hash=p_source_set_hash and coalesce(a.answer_text,'') !~* '(насильств|ненавист|суїцид)' then 'approved' else 'pending' end from public.questions q where a.submission_id=d.submission_id and q.id=a.question_id;
 update public.media_assets m set privacy_status=case when q.settings->>'public_source_policy'='automatic_with_consent' and p_consent and r.source_set_hash=p_source_set_hash and m.kind='image' then 'public_allowed' else 'review_required' end,moderation_status=case when q.settings->>'public_source_policy'='automatic_with_consent' and p_consent and r.source_set_hash=p_source_set_hash and m.kind='image' then 'approved' else 'pending' end from public.answers a join public.questions q on q.id=a.question_id where m.answer_id=a.id and m.submission_id=d.submission_id and m.status='ready';
 update public.submissions set status='submitted',submitted_at=now(),public_use_consent_state=case when p_consent then 'granted' else 'declined' end,public_use_consent_version=p_consent_version,public_use_source_set_hash=p_source_set_hash,public_use_consented_at=now() where id=d.submission_id;
 update public.public_submission_drafts set state='finalized',finalized_at=now(),last_active_at=now() where id=d.id;
 return jsonb_build_object('submission_id',d.submission_id,'finalized',true);
end $$;

create or replace function public.begin_public_submission_draft(text,text,text,text) returns jsonb language sql security invoker set search_path='' as $$ select private.begin_public_submission_draft($1,$2,$3,$4) $$;
create or replace function public.save_public_submission_draft(text,jsonb) returns boolean language sql security invoker set search_path='' as $$ select private.save_public_submission_draft($1,$2) $$;
create or replace function public.finalize_public_submission_draft(text,boolean,text,text) returns jsonb language sql security invoker set search_path='' as $$ select private.finalize_public_submission_draft($1,$2,$3,$4) $$;
revoke all on function public.begin_public_submission_draft(text,text,text,text),public.save_public_submission_draft(text,jsonb),public.finalize_public_submission_draft(text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.begin_public_submission_draft(text,text,text,text),public.save_public_submission_draft(text,jsonb),public.finalize_public_submission_draft(text,boolean,text,text) to service_role;

create or replace function public.expire_public_submission_drafts(p_limit integer default 100) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 with expired as (select id from public.public_submission_drafts where expires_at<now() and state not in ('finalized','expired') order by expires_at limit least(greatest(p_limit,1),500) for update skip locked) update public.public_submission_drafts d set state='expired' from expired e where d.id=e.id; get diagnostics n=row_count; return n;
end $$;
revoke all on function public.expire_public_submission_drafts(integer) from public,anon,authenticated; grant execute on function public.expire_public_submission_drafts(integer) to service_role;

create or replace function private.prepare_public_draft_media_upload(p_capability_hash text,p_question_id uuid,p_original_filename text,p_mime_type text,p_size_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.public_submission_drafts%rowtype; q public.questions%rowtype; kind text; answer uuid; asset uuid; path text; max_files integer;
begin
 select * into d from public.public_submission_drafts where capability_hash=p_capability_hash and state in ('started','uploading','ready_to_finalize') and expires_at>now() for update; if not found then raise exception 'Draft unavailable'; end if;
 select x.* into q from public.questions x join public.questionnaire_revision_questions rq on rq.question_id=x.id where rq.revision_id=d.revision_id and rq.question_id=p_question_id and rq.is_active and x.type='media'; if not found then raise exception 'Media role unavailable'; end if;
 kind:=case when p_mime_type like 'image/%' then 'image' when p_mime_type like 'video/%' then 'video' when p_mime_type like 'audio/%' then 'audio' end;
 if kind is null or not(q.settings#>'{media_constraints,allowed_kinds}' @> jsonb_build_array(kind)) or p_size_bytes<=0 or p_size_bytes>104857600 or (kind='image' and p_size_bytes>10485760) or (kind='audio' and p_size_bytes>26214400) then raise exception 'Media violates role constraints'; end if;
 max_files:=coalesce((q.settings#>>'{media_constraints,max_files}')::int,1); if (select count(*) from public.media_assets m join public.answers a on a.id=m.answer_id where m.submission_id=d.submission_id and a.question_id=q.id and m.status<>'deleted')>=max_files then raise exception 'Media role limit reached'; end if;
 select id into answer from public.answers where submission_id=d.submission_id and question_id=q.id; if answer is null then insert into public.answers(host_id,event_id,submission_id,question_id,answer_json,privacy_status,moderation_status) values(d.host_id,d.event_id,d.submission_id,q.id,jsonb_build_object('media',true),'review_required','pending') returning id into answer; end if;
 asset:=gen_random_uuid(); path:=d.event_id||'/'||d.submission_id||'/'||asset||'/'||regexp_replace(left(p_original_filename,255),'[^A-Za-z0-9._-]','_','g');
 insert into public.media_assets(id,host_id,event_id,submission_id,answer_id,kind,bucket,storage_path,original_filename,mime_type,size_bytes,status,privacy_status,moderation_status) values(asset,d.host_id,d.event_id,d.submission_id,answer,kind,'event-media',path,left(p_original_filename,255),p_mime_type,p_size_bytes,'pending','review_required','pending');
 update public.public_submission_drafts set state='uploading',last_active_at=now(),expires_at=now()+interval '7 days' where id=d.id;
 return jsonb_build_object('asset_id',asset,'storage_path',path,'kind',kind);
end $$;

create or replace function private.complete_public_draft_media_upload(p_capability_hash text,p_asset_id uuid,p_actual_size_bytes bigint,p_actual_mime_type text)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.public_submission_drafts%rowtype; a public.media_assets%rowtype;
begin
 select * into d from public.public_submission_drafts where capability_hash=p_capability_hash and state in ('uploading','ready_to_finalize') and expires_at>now(); if not found then raise exception 'Draft unavailable'; end if;
 select * into a from public.media_assets where id=p_asset_id and submission_id=d.submission_id and status='pending' for update; if not found then raise exception 'Asset unavailable'; end if;
 if p_actual_size_bytes<>a.size_bytes or p_actual_mime_type<>a.mime_type then update public.media_assets set status='rejected',moderation_status='rejected' where id=a.id; return false; end if;
 update public.media_assets set status='ready' where id=a.id; update public.public_submission_drafts set state='ready_to_finalize',last_active_at=now() where id=d.id; return true;
end $$;
create or replace function public.prepare_public_draft_media_upload(text,uuid,text,text,bigint) returns jsonb language sql security invoker set search_path='' as $$select private.prepare_public_draft_media_upload($1,$2,$3,$4,$5)$$;
create or replace function public.complete_public_draft_media_upload(text,uuid,bigint,text) returns boolean language sql security invoker set search_path='' as $$select private.complete_public_draft_media_upload($1,$2,$3,$4)$$;
revoke all on function public.prepare_public_draft_media_upload(text,uuid,text,text,bigint),public.complete_public_draft_media_upload(text,uuid,bigint,text) from public,anon,authenticated; grant execute on function public.prepare_public_draft_media_upload(text,uuid,text,text,bigint),public.complete_public_draft_media_upload(text,uuid,bigint,text) to service_role;

create or replace function public.create_questionnaire_with_questions_tx(p_questionnaire_id uuid,p_event_id uuid,p_audience text,p_title text,p_public_token_hash text,p_questions jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare host uuid; revision uuid; item jsonb; question uuid; position integer:=0;
begin
 if p_audience not in ('customer','guest','bride','groom','couple','other') or char_length(btrim(p_title)) not between 1 and 160 or p_public_token_hash!~'^[0-9a-f]{64}$' or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions) not between 1 and 50 then raise exception 'Invalid questionnaire'; end if;
 select e.host_id into host from public.events e where e.id=p_event_id and e.host_id=(select auth.uid()) for update; if not found then raise exception 'Event not found'; end if;
 insert into public.questionnaires(id,host_id,event_id,audience,title,status,public_token_hash) values(p_questionnaire_id,host,p_event_id,p_audience,btrim(p_title),'draft',p_public_token_hash);
 insert into public.questionnaire_revisions(questionnaire_id,event_id,host_id,version,state) values(p_questionnaire_id,p_event_id,host,1,'draft') returning id into revision;
 update public.questionnaires set draft_revision_id=revision where id=p_questionnaire_id;
 for item in select value from jsonb_array_elements(p_questions) loop
   position:=position+1;
   if not private.pack2_validate_settings(item->>'type',coalesce(item->'settings','{}')) then raise exception 'Invalid question settings'; end if;
   insert into public.questions(host_id,event_id,questionnaire_id,type,prompt,help_text,is_required,is_active,sort_order,settings,default_privacy)
   values(host,p_event_id,p_questionnaire_id,item->>'type',item->>'prompt',nullif(item->>'help_text',''),coalesce((item->>'is_required')::boolean,false),true,coalesce((item->>'sort_order')::integer,position*10),coalesce(item->'settings','{}'),coalesce(item->>'default_privacy','review_required')) returning id into question;
   insert into public.questionnaire_revision_questions(revision_id,questionnaire_id,event_id,host_id,question_id,sort_order,is_required,is_active) values(revision,p_questionnaire_id,p_event_id,host,question,coalesce((item->>'sort_order')::integer,position*10),coalesce((item->>'is_required')::boolean,false),true);
 end loop;
 return p_questionnaire_id;
end $$;
revoke all on function public.create_questionnaire_with_questions_tx(uuid,uuid,text,text,text,jsonb) from public,anon; grant execute on function public.create_questionnaire_with_questions_tx(uuid,uuid,text,text,text,jsonb) to authenticated;

create or replace function public.add_draft_question_tx(p_questionnaire_id uuid,p_draft_revision_id uuid,p_expected_row_version bigint,p_idempotency_key uuid,p_type text,p_prompt text,p_is_required boolean,p_settings jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.questionnaire_revisions%rowtype; qid uuid; position integer; receipt jsonb;
begin
 select x.receipt into receipt from public.questionnaire_mutation_receipts x where x.questionnaire_id=p_questionnaire_id and x.idempotency_key=p_idempotency_key and x.operation='add_question'; if receipt is not null then return receipt; end if;
 select * into r from public.questionnaire_revisions where id=p_draft_revision_id and questionnaire_id=p_questionnaire_id and host_id=(select auth.uid()) and state='draft' and row_version=p_expected_row_version for update; if not found then raise exception using errcode='40001',message='Draft version conflict'; end if;
 if not private.pack2_validate_settings(p_type,p_settings) then raise exception 'Invalid settings'; end if;
 select coalesce(max(sort_order),0)+10 into position from public.questionnaire_revision_questions where revision_id=r.id;
 insert into public.questions(host_id,event_id,questionnaire_id,type,prompt,is_required,sort_order,settings,default_privacy) values(r.host_id,r.event_id,r.questionnaire_id,p_type,btrim(p_prompt),p_is_required,position,p_settings,'review_required') returning id into qid;
 insert into public.questionnaire_revision_questions(revision_id,questionnaire_id,event_id,host_id,question_id,sort_order,is_required,is_active) values(r.id,r.questionnaire_id,r.event_id,r.host_id,qid,position,p_is_required,true);
 update public.questionnaire_revisions set row_version=row_version+1 where id=r.id; receipt:=jsonb_build_object('question_id',qid,'row_version',r.row_version+1); insert into public.questionnaire_mutation_receipts values(r.questionnaire_id,p_idempotency_key,'add_question',receipt,now()); return receipt;
end $$;

create or replace function public.move_question_tx(p_event_id uuid,p_questionnaire_id uuid,p_question_id uuid,p_direction text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.questionnaires%rowtype; revision uuid; current_row public.questionnaire_revision_questions%rowtype; other_row public.questionnaire_revision_questions%rowtype; tmp integer;
begin
 if p_direction not in ('up','down') then raise exception 'Invalid direction'; end if;
 select * into q from public.questionnaires where id=p_questionnaire_id and event_id=p_event_id and host_id=(select auth.uid()) for update; if not found then raise exception 'Questionnaire not found'; end if;
 revision:=coalesce(q.draft_revision_id,q.published_revision_id); if q.published_revision_id is not null and q.draft_revision_id is null then raise exception 'Create a draft before reordering'; end if;
 select * into current_row from public.questionnaire_revision_questions where revision_id=revision and question_id=p_question_id;
 select * into other_row from public.questionnaire_revision_questions where revision_id=revision and (case when p_direction='up' then sort_order<current_row.sort_order else sort_order>current_row.sort_order end) order by case when p_direction='up' then -sort_order else sort_order end limit 1;
 if not found then return false; end if;
 tmp:=current_row.sort_order; update public.questionnaire_revision_questions set sort_order=-2147483648 where revision_id=revision and question_id=current_row.question_id; update public.questionnaire_revision_questions set sort_order=tmp where revision_id=revision and question_id=other_row.question_id; update public.questionnaire_revision_questions set sort_order=other_row.sort_order where revision_id=revision and question_id=current_row.question_id; update public.questionnaire_revisions set row_version=row_version+1 where id=revision; return true;
end $$;

commit;
