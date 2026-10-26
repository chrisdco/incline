import { memo } from 'react';

import { SeriesAreaChart } from './series-area-chart';
import { formatDisplayWeight } from '@/db/calc';
import { kgToDisplay, weightLabel } from '@/lib/units';
import type { Unit } from '@/db/types';

/** Weight progression area chart for a single exercise. */
export const ProgressionChart = memo(function ProgressionChart({
  points,
  unit,
  title = 'Heaviest weight',
  className,
}: {
  points: { label: string; weight: number }[];
  unit: Unit;
  title?: string;
  className?: string;
}) {
  return (
    <SeriesAreaChart
      className={className}
      title={title}
      // Points arrive in canonical kg; the axis plots the display unit.
      points={points.map((p) => ({ label: p.label, value: kgToDisplay(p.weight, unit) }))}
      formatValue={(v) => formatDisplayWeight(v, unit)}
      valueHint={weightLabel(unit)}
    />
  );
});
