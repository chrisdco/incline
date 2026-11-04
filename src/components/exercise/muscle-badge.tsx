import { Badge } from '@/components/ui/badge';
import { MUSCLE_LABELS } from '@/lib/labels';
import type { MuscleGroup } from '@/db/types';

/** Compact muscle group badge. */
export function MuscleBadge({ muscle, className }: { muscle: MuscleGroup | string; className?: string }) {
  // Catalog rows can carry muscles outside the enum ("quadriceps"): title-case
  // them so badges don't mix casing in one list.
  const label = MUSCLE_LABELS[muscle as MuscleGroup] ?? muscle.charAt(0).toUpperCase() + muscle.slice(1);
  return (
    <Badge variant="neutral" className={className}>
      {label}
    </Badge>
  );
}
