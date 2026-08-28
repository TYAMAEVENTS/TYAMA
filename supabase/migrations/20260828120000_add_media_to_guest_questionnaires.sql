begin;

update public.questionnaires
set allow_images = true,
    allow_video = true,
    allow_audio = true
where audience in ('guest', 'other');

insert into public.questions (
  host_id,
  event_id,
  questionnaire_id,
  type,
  prompt,
  help_text,
  is_required,
  sort_order,
  default_privacy
)
select
  questionnaire.host_id,
  questionnaire.event_id,
  questionnaire.id,
  'media',
  'Додайте фото, відео або аудіо для героїв події',
  'До 10 файлів. Усе спочатку побачить і перевірить ведучий.',
  false,
  coalesce((
    select max(question.sort_order) + 10
    from public.questions as question
    where question.questionnaire_id = questionnaire.id
  ), 10),
  'review_required'
from public.questionnaires as questionnaire
where questionnaire.audience in ('guest', 'other')
  and not exists (
    select 1
    from public.questions as question
    where question.questionnaire_id = questionnaire.id
      and question.type = 'media'
  );

commit;
