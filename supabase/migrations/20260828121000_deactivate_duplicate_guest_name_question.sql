begin;

update public.questions as question
set is_active = false
from public.questionnaires as questionnaire
where questionnaire.id = question.questionnaire_id
  and questionnaire.audience in ('guest', 'other')
  and question.type = 'short_text'
  and lower(trim(question.prompt)) in ('як вас звати?', 'як вас звати')
  and question.is_active = true;

commit;
