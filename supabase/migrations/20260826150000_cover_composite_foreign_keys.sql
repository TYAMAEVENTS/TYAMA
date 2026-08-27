begin;

create index questionnaires_event_host_fk_idx on public.questionnaires(event_id, host_id);
create index questions_event_host_fk_idx on public.questions(event_id, host_id);
create index questions_questionnaire_event_host_fk_idx on public.questions(questionnaire_id, event_id, host_id);
create index respondents_event_host_fk_idx on public.respondents(event_id, host_id);
create index submissions_event_host_fk_idx on public.submissions(event_id, host_id);
create index submissions_questionnaire_event_host_fk_idx on public.submissions(questionnaire_id, event_id, host_id);
create index submissions_respondent_event_host_fk_idx on public.submissions(respondent_id, event_id, host_id);
create index answers_event_host_fk_idx on public.answers(event_id, host_id);
create index answers_submission_event_host_fk_idx on public.answers(submission_id, event_id, host_id);
create index answers_question_event_host_fk_idx on public.answers(question_id, event_id, host_id);
create index media_assets_event_host_fk_idx on public.media_assets(event_id, host_id);
create index media_assets_submission_event_host_fk_idx on public.media_assets(submission_id, event_id, host_id);
create index media_assets_answer_event_host_fk_idx on public.media_assets(answer_id, event_id, host_id);
create index event_kit_items_event_host_fk_idx on public.event_kit_items(event_id, host_id);
create index live_sessions_event_host_fk_idx on public.live_sessions(event_id, host_id);
create index live_state_event_host_fk_idx on public.live_state(event_id, host_id);
create index live_state_session_event_host_fk_idx on public.live_state(live_session_id, event_id, host_id);
create index live_state_item_event_host_fk_idx on public.live_state(source_event_kit_item_id, event_id, host_id);

commit;
