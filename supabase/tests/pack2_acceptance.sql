\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role)
values
('10000000-0000-4000-8000-000000000001','host-ci@example.invalid','',now(),'{}','{"display_name":"CI Host"}','authenticated','authenticated');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

insert into public.events(id,host_id,event_type,title)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','birthday','Synthetic PACK 2');

select public.create_questionnaire_with_questions_tx(
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'guest','Synthetic guest questionnaire',repeat('a',64),
  jsonb_build_array(
    jsonb_build_object('type','long_text','prompt','Synthetic quote','is_required',true,'sort_order',10,'default_privacy','review_required','settings',jsonb_build_object('schema_version',1,'template_id','guest.who_said.quote.v1','template_version',1,'semantic_key','guest.who_said.quote.v1','module_key','who_said.primary','module_role','primary','content_intents',jsonb_build_array('who_said'),'who_said_role','quote','public_source_policy','automatic_with_consent')),
    jsonb_build_object('type','media','prompt','Synthetic selfie','is_required',false,'sort_order',20,'default_privacy','review_required','settings',jsonb_build_object('schema_version',1,'template_id','guest.who_said.selfie.v1','template_version',1,'semantic_key','guest.who_said.selfie.v1','module_key','who_said.primary','module_role','companion','content_intents',jsonb_build_array('who_said','media'),'who_said_role','selfie','media_role','who_said_selfie','public_source_policy','automatic_with_consent','media_constraints',jsonb_build_object('allowed_kinds',jsonb_build_array('image'),'max_files',1,'capture','user','public_image_policy','automatic_with_consent','video_policy','host_only','audio_policy','host_only')))
  )
);

do $$
declare q public.questionnaires%rowtype; r public.questionnaire_revisions%rowtype; answer_question uuid; receipt jsonb; updated jsonb;
begin
 select * into q from public.questionnaires where id='30000000-0000-4000-8000-000000000001';
 if q.draft_revision_id is null then raise exception 'revision 1 missing'; end if;
 select * into r from public.questionnaire_revisions where id=q.draft_revision_id;
 if r.version<>1 or r.state<>'draft' then raise exception 'invalid initial revision'; end if;
 if (select count(*) from public.questionnaire_revision_questions where revision_id=r.id)<>2 then raise exception 'revision membership incomplete'; end if;
 select question_id into answer_question from public.questionnaire_revision_questions where revision_id=r.id order by sort_order limit 1;
 receipt:=public.authorize_questionnaire_sources_tx(q.id,r.id,r.row_version,'40000000-0000-4000-8000-000000000001','pack2-v1');
 receipt:=public.publish_questionnaire_revision_tx(q.id,null,r.id,(receipt->>'row_version')::bigint,'40000000-0000-4000-8000-000000000002');
 select * into q from public.questionnaires where id=q.id;
 select * into r from public.questionnaire_revisions where id=q.published_revision_id;
 receipt:=public.ensure_questionnaire_draft_tx(q.id,r.id,r.row_version,'40000000-0000-4000-8000-000000000003');
 select * into r from public.questionnaire_revisions where id=(receipt->>'draft_revision_id')::uuid;
 updated:=public.update_draft_question_tx(q.id,r.id,answer_question,r.row_version,'40000000-0000-4000-8000-000000000004','Meaning changed custom prompt','',true,true,(select settings from public.questions where id=answer_question));
 if not (updated->>'semantic_drift')::boolean then raise exception 'semantic drift not demoted'; end if;
 if exists(select 1 from public.questions where id=answer_question and prompt='Meaning changed custom prompt') then raise exception 'published definition mutated'; end if;
 begin
   perform public.update_draft_question_tx(q.id,r.id,(updated->>'question_id')::uuid,r.row_version,'40000000-0000-4000-8000-000000000005','stale','',true,true,'{}');
   raise exception 'stale version accepted';
 exception when serialization_failure then null;
 end;
end $$;

reset role;
set local role service_role;

select private.begin_public_submission_draft(repeat('a',64),repeat('b',64),repeat('c',64),'Synthetic Guest');

do $$
declare qid uuid; saved boolean; result jsonb;
begin
 select rq.question_id into qid from public.questionnaires q join public.questionnaire_revision_questions rq on rq.revision_id=q.published_revision_id join public.questions x on x.id=rq.question_id where q.id='30000000-0000-4000-8000-000000000001' and x.type='long_text';
 saved:=private.save_public_submission_draft(repeat('c',64),jsonb_build_array(jsonb_build_object('question_id',qid,'answer_text','Synthetic safe quote')));
 begin
   perform private.save_public_submission_draft(repeat('d',64),'[]');
   raise exception 'cross-draft capability accepted';
 exception when others then
   if sqlerrm='cross-draft capability accepted' then raise; end if;
 end;
 select private.finalize_public_submission_draft(repeat('c',64),true,'pack2-consent-v1',r.source_set_hash) into result from public.questionnaire_revisions r join public.questionnaires q on q.published_revision_id=r.id where q.id='30000000-0000-4000-8000-000000000001';
 if not (result->>'finalized')::boolean then raise exception 'finalization failed'; end if;
 if (select status from public.submissions where id=(result->>'submission_id')::uuid)<>'submitted' then raise exception 'submission not finalized'; end if;
 if (select privacy_status from public.answers where submission_id=(result->>'submission_id')::uuid)<>'public_allowed' then raise exception 'consent state mapping failed'; end if;
 if (select public_use_consent_state from public.submissions where id=(result->>'submission_id')::uuid)<>'granted' then raise exception 'consent evidence missing'; end if;
 if (private.finalize_public_submission_draft(repeat('c',64),true,'pack2-consent-v1',(select source_set_hash from public.questionnaire_revisions r join public.questionnaires q on q.published_revision_id=r.id where q.id='30000000-0000-4000-8000-000000000001'))->>'submission_id') <> (result->>'submission_id') then raise exception 'finalize not idempotent'; end if;
end $$;

rollback;
