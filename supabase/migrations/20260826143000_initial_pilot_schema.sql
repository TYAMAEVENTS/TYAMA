begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  status text not null default 'active' check (status in ('active', 'disabled')),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id),
  event_type text not null check (event_type in ('wedding', 'birthday', 'corporate', 'other')),
  title text not null check (char_length(title) between 1 and 160),
  client_name text,
  event_date date,
  location text,
  internal_notes text,
  status text not null default 'draft' check (status in ('draft', 'collecting', 'preparing', 'ready', 'live', 'completed', 'archived')),
  public_screen_token_hash text unique,
  public_screen_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, host_id)
);

create table public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  event_id uuid not null,
  audience text not null check (audience in ('customer', 'guest', 'bride', 'groom', 'couple', 'other')),
  title text not null check (char_length(title) between 1 and 160),
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  public_token_hash text unique,
  allow_images boolean not null default false,
  allow_video boolean not null default false,
  allow_audio boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, host_id) references public.events(id, host_id),
  unique (id, event_id, host_id)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  event_id uuid not null,
  questionnaire_id uuid not null,
  type text not null check (type in ('short_text', 'long_text', 'single_select', 'multi_select', 'boolean', 'media')),
  prompt text not null check (char_length(prompt) between 1 and 1000),
  help_text text,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  default_privacy text not null default 'review_required' check (default_privacy in ('host_only', 'review_required', 'public_allowed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, host_id) references public.events(id, host_id),
  foreign key (questionnaire_id, event_id, host_id) references public.questionnaires(id, event_id, host_id),
  unique (id, event_id, host_id)
);

create table public.respondents (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  event_id uuid not null,
  display_name text,
  relationship_label text,
  contact_email text,
  contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, host_id) references public.events(id, host_id),
  unique (id, event_id, host_id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  event_id uuid not null,
  questionnaire_id uuid not null,
  respondent_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed', 'rejected')),
  submission_token_hash text unique,
  idempotency_key_hash text unique,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, host_id) references public.events(id, host_id),
  foreign key (questionnaire_id, event_id, host_id) references public.questionnaires(id, event_id, host_id),
  foreign key (respondent_id, event_id, host_id) references public.respondents(id, event_id, host_id),
  unique (id, event_id, host_id)
);

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  event_id uuid not null,
  submission_id uuid not null,
  question_id uuid not null,
  answer_text text,
  answer_json jsonb,
  privacy_status text not null default 'review_required' check (privacy_status in ('host_only', 'review_required', 'public_allowed')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  is_useful boolean not null default false,
  do_not_use boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, host_id) references public.events(id, host_id),
  foreign key (submission_id, event_id, host_id) references public.submissions(id, event_id, host_id),
  foreign key (question_id, event_id, host_id) references public.questions(id, event_id, host_id),
  unique (submission_id, question_id),
  unique (id, event_id, host_id),
  check (answer_text is not null or answer_json is not null)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  event_id uuid not null,
  submission_id uuid,
  answer_id uuid,
  kind text not null check (kind in ('image', 'video', 'audio', 'other')),
  bucket text not null default 'event-media' check (bucket = 'event-media'),
  storage_path text not null unique,
  original_filename text,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  duration_seconds numeric,
  status text not null default 'pending' check (status in ('pending', 'ready', 'rejected', 'deleted')),
  privacy_status text not null default 'review_required' check (privacy_status in ('host_only', 'review_required', 'public_allowed')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, host_id) references public.events(id, host_id),
  foreign key (submission_id, event_id, host_id) references public.submissions(id, event_id, host_id),
  foreign key (answer_id, event_id, host_id) references public.answers(id, event_id, host_id),
  check (kind <> 'image' or size_bytes <= 10485760),
  check (kind <> 'audio' or size_bytes <= 26214400)
);

create table public.event_kit_items (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  event_id uuid not null,
  source_type text not null check (source_type in ('manual', 'ai')),
  item_type text not null check (item_type in ('fact', 'story', 'question', 'interactive', 'media', 'warning', 'note', 'other')),
  title text,
  content text,
  data jsonb not null default '{}'::jsonb,
  source_refs jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'used')),
  privacy_status text not null default 'host_only' check (privacy_status in ('host_only', 'review_required', 'public_allowed')),
  is_useful boolean not null default false,
  do_not_use boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, host_id) references public.events(id, host_id),
  unique (id, event_id, host_id),
  check (title is not null or content is not null)
);

create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null,
  event_id uuid not null,
  mode text not null check (mode in ('rehearsal', 'live')),
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (event_id, host_id) references public.events(id, host_id),
  unique (id, event_id, host_id),
  check ((status = 'active' and ended_at is null) or status = 'ended')
);

create unique index one_active_live_session_per_event
on public.live_sessions (event_id)
where status = 'active';

create table public.live_state (
  event_id uuid primary key,
  host_id uuid not null,
  live_session_id uuid,
  revision bigint not null default 0 check (revision >= 0),
  mode text not null default 'idle' check (mode in ('idle', 'message', 'question', 'reveal', 'media', 'clear')),
  source_event_kit_item_id uuid,
  public_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  foreign key (event_id, host_id) references public.events(id, host_id),
  foreign key (live_session_id, event_id, host_id) references public.live_sessions(id, event_id, host_id),
  foreign key (source_event_kit_item_id, event_id, host_id) references public.event_kit_items(id, event_id, host_id)
);

create index events_host_date_idx on public.events(host_id, event_date);
create index questionnaires_event_order_idx on public.questionnaires(event_id, created_at);
create index questionnaires_host_idx on public.questionnaires(host_id);
create index questions_event_order_idx on public.questions(event_id, questionnaire_id, sort_order);
create index questions_host_idx on public.questions(host_id);
create index respondents_event_created_idx on public.respondents(event_id, created_at);
create index respondents_host_idx on public.respondents(host_id);
create index submissions_event_created_idx on public.submissions(event_id, created_at);
create index submissions_questionnaire_idx on public.submissions(questionnaire_id, created_at);
create index submissions_host_idx on public.submissions(host_id);
create index answers_event_created_idx on public.answers(event_id, created_at);
create index answers_host_idx on public.answers(host_id);
create index answers_question_idx on public.answers(question_id);
create index media_assets_event_created_idx on public.media_assets(event_id, created_at);
create index media_assets_submission_idx on public.media_assets(submission_id);
create index media_assets_host_idx on public.media_assets(host_id);
create index event_kit_items_event_order_idx on public.event_kit_items(event_id, sort_order, created_at);
create index event_kit_items_host_idx on public.event_kit_items(host_id);
create index live_sessions_event_created_idx on public.live_sessions(event_id, created_at);
create index live_sessions_host_idx on public.live_sessions(host_id);
create index live_state_host_idx on public.live_state(host_id);

create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();
create trigger events_set_updated_at before update on public.events for each row execute function private.set_updated_at();
create trigger questionnaires_set_updated_at before update on public.questionnaires for each row execute function private.set_updated_at();
create trigger questions_set_updated_at before update on public.questions for each row execute function private.set_updated_at();
create trigger respondents_set_updated_at before update on public.respondents for each row execute function private.set_updated_at();
create trigger submissions_set_updated_at before update on public.submissions for each row execute function private.set_updated_at();
create trigger answers_set_updated_at before update on public.answers for each row execute function private.set_updated_at();
create trigger media_assets_set_updated_at before update on public.media_assets for each row execute function private.set_updated_at();
create trigger event_kit_items_set_updated_at before update on public.event_kit_items for each row execute function private.set_updated_at();
create trigger live_state_set_updated_at before update on public.live_state for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, ''), '@', 1), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.questionnaires enable row level security;
alter table public.questions enable row level security;
alter table public.respondents enable row level security;
alter table public.submissions enable row level security;
alter table public.answers enable row level security;
alter table public.media_assets enable row level security;
alter table public.event_kit_items enable row level security;
alter table public.live_sessions enable row level security;
alter table public.live_state enable row level security;

revoke all on table public.profiles, public.events, public.questionnaires, public.questions, public.respondents, public.submissions, public.answers, public.media_assets, public.event_kit_items, public.live_sessions, public.live_state from anon;
revoke all on table public.profiles, public.events, public.questionnaires, public.questions, public.respondents, public.submissions, public.answers, public.media_assets, public.event_kit_items, public.live_sessions, public.live_state from authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.events to authenticated;
grant select, insert, update, delete on public.questionnaires, public.questions, public.event_kit_items to authenticated;
grant select, insert, update on public.respondents, public.submissions, public.answers, public.media_assets, public.live_sessions, public.live_state to authenticated;
grant delete on public.media_assets to authenticated;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy events_select_own on public.events for select to authenticated using ((select auth.uid()) = host_id);
create policy events_insert_own on public.events for insert to authenticated with check ((select auth.uid()) = host_id);
create policy events_update_own on public.events for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);

create policy questionnaires_select_own on public.questionnaires for select to authenticated using ((select auth.uid()) = host_id);
create policy questionnaires_insert_own on public.questionnaires for insert to authenticated with check ((select auth.uid()) = host_id);
create policy questionnaires_update_own on public.questionnaires for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
create policy questionnaires_delete_own on public.questionnaires for delete to authenticated using ((select auth.uid()) = host_id);

create policy questions_select_own on public.questions for select to authenticated using ((select auth.uid()) = host_id);
create policy questions_insert_own on public.questions for insert to authenticated with check ((select auth.uid()) = host_id);
create policy questions_update_own on public.questions for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
create policy questions_delete_own on public.questions for delete to authenticated using ((select auth.uid()) = host_id);

create policy respondents_select_own on public.respondents for select to authenticated using ((select auth.uid()) = host_id);
create policy respondents_insert_own on public.respondents for insert to authenticated with check ((select auth.uid()) = host_id);
create policy respondents_update_own on public.respondents for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);

create policy submissions_select_own on public.submissions for select to authenticated using ((select auth.uid()) = host_id);
create policy submissions_insert_own on public.submissions for insert to authenticated with check ((select auth.uid()) = host_id);
create policy submissions_update_own on public.submissions for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);

create policy answers_select_own on public.answers for select to authenticated using ((select auth.uid()) = host_id);
create policy answers_insert_own on public.answers for insert to authenticated with check ((select auth.uid()) = host_id);
create policy answers_update_own on public.answers for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);

create policy media_assets_select_own on public.media_assets for select to authenticated using ((select auth.uid()) = host_id);
create policy media_assets_insert_own on public.media_assets for insert to authenticated with check ((select auth.uid()) = host_id);
create policy media_assets_update_own on public.media_assets for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
create policy media_assets_delete_own on public.media_assets for delete to authenticated using ((select auth.uid()) = host_id);

create policy event_kit_items_select_own on public.event_kit_items for select to authenticated using ((select auth.uid()) = host_id);
create policy event_kit_items_insert_own on public.event_kit_items for insert to authenticated with check ((select auth.uid()) = host_id);
create policy event_kit_items_update_own on public.event_kit_items for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
create policy event_kit_items_delete_own on public.event_kit_items for delete to authenticated using ((select auth.uid()) = host_id);

create policy live_sessions_select_own on public.live_sessions for select to authenticated using ((select auth.uid()) = host_id);
create policy live_sessions_insert_own on public.live_sessions for insert to authenticated with check ((select auth.uid()) = host_id);
create policy live_sessions_update_own on public.live_sessions for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);

create policy live_state_select_own on public.live_state for select to authenticated using ((select auth.uid()) = host_id);
create policy live_state_insert_own on public.live_state for insert to authenticated with check ((select auth.uid()) = host_id);
create policy live_state_update_own on public.live_state for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-media',
  'event-media',
  false,
  104857600,
  array['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy event_media_host_select
on storage.objects for select to authenticated
using (bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy event_media_host_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy event_media_host_update
on storage.objects for update to authenticated
using (bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy event_media_host_delete
on storage.objects for delete to authenticated
using (bucket_id = 'event-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
