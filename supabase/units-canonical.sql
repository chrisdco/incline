-- One-time: canonical storage units (docs/decisions/TECH-DECISIONS.md §15).
--
-- Loads are stored in kg. Before §15 the web importer could write pound
-- numbers with workout_logs.unit = 'imperial'; the app now reads every set
-- weight as kg, so convert those logs and their sets once. Idempotent: after
-- it runs no log carries 'imperial', so a re-run matches nothing.
--
-- The app converts its own local data on first launch (src/db/canonical-units.ts)
-- and re-pushes it; this script only covers rows that exist solely in Supabase.

begin;

update public.set_entries s
set weight = s.weight / 2.2046226218,
    updated_at = now()
from public.workout_logs w
where w.id = s.workout_log_id
  and w.unit = 'imperial';

update public.workout_logs
set total_volume = total_volume / 2.2046226218,
    unit = 'metric',
    updated_at = now()
where unit = 'imperial';

update public.bodyweight_entries
set weight = weight / 2.2046226218, unit = 'kg', updated_at = now()
where unit = 'lb';

update public.body_measurements
set value = value * 2.54, unit = 'cm', updated_at = now()
where unit = 'in';

commit;
