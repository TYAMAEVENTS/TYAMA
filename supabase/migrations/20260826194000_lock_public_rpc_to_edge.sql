begin;

drop function if exists public.get_public_questionnaire(text);
drop function if exists public.get_public_screen_state(text);

alter function public.submit_questionnaire(text, text, text, jsonb) security invoker;
revoke all on function public.submit_questionnaire(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_questionnaire(text, text, text, jsonb) to service_role;

commit;
