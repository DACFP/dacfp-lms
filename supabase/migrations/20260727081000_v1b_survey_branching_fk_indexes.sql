create index lms_survey_questions_section_same_lesson_idx
  on public.lms_survey_questions (section_id, lesson_id);

create index lms_survey_sections_default_next_same_lesson_idx
  on public.lms_survey_sections (default_next_section_id, lesson_id);
