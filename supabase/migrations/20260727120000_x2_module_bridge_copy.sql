alter table public.lms_modules
  add column bridge_copy text null;

comment on column public.lms_modules.bridge_copy is
  'One-line learner-facing reason the module matters, shown after the preceding quiz pass.';
