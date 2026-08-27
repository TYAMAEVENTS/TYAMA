begin;

alter table public.event_kit_items
  drop constraint event_kit_items_source_type_check;

alter table public.event_kit_items
  add constraint event_kit_items_source_type_check
  check (source_type in ('manual', 'rules', 'ai'));

update public.event_kit_items
set source_type = 'rules'
where source_type = 'ai'
  and data->>'generator' = 'smart_draft_v1';

commit;
