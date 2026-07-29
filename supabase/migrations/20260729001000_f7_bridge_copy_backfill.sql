-- Existing FPT modules predate the bridge_copy column. Restore the committed
-- synthetic seed copy without overwriting any operator-authored value.
update public.lms_modules module
set bridge_copy = seed.bridge_copy
from public.lms_courses course
join (
  values
    (0, 'See the full path ahead before beginning the Financial Professional Track.'),
    (1, 'Build the monetary and market foundation behind the asset clients ask about most.'),
    (2, 'See how distributed ledgers create verifiable ownership and settlement beyond Bitcoin.'),
    (3, 'Distinguish the major asset types before evaluating their roles and risks.'),
    (4, 'Connect scaling, tokens, and DeFi to real advisory opportunities and tradeoffs.')
) seed(position, bridge_copy) on true
where course.id = module.course_id
  and course.slug = 'fpt-sandbox'
  and module.position = seed.position
  and module.bridge_copy is null;
