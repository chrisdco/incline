import { Badge } from '@/components/ui/badge';
import { MUSCLE_LABELS } from '@/lib/labels';
import type { MuscleGroup } from '@/db/types';

/**
 * Display label for a muscle. Catalog rows can carry muscles outside the enum
 * ("quadriceps"): title-case them so one list never mixes casing.
 */
export function muscleLabel(muscle: MuscleGroup | string): string {
  return MUSCLE_LABELS[muscle as MuscleGroup] ?? muscle.charAt(0).toUpperCase() + muscle.slice(1);
}

/** Compact muscle group badge. */
export function MuscleBadge({ muscle, className }: { muscle: MuscleGroup | string; className?: string }) {
  const label = muscleLabel(muscle);
  return (
    <Badge variant="neutral" className={className}>
      {label}
    </Badge>
  );
}
