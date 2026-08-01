-- M1 rider: the stalled-threshold constant carries SECURITY DEFINER like
-- every other function this phase ships (standing rule), even though it
-- reads nothing.
alter function public.lms_stalled_threshold_days() security definer;
