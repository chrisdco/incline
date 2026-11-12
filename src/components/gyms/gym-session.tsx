import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { Check, ChevronDown, MapPin } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption } from '@/components/common/text';
import { ListGroup, ListRow } from '@/components/layout';
import { Sheet } from '@/components/ui/sheet';
import { Tappable } from '@/components/ui/tappable';
import { useToast } from '@/components/ui/toast';
import { setWorkoutGym } from '@/db/queries';
import { sessionEngine } from '@/features/session';
import { useGymsState } from '@/hooks/use-data';
import { workoutGymQuery } from '@/lib/query-keys';

import { gymSummary } from './gym-format';

/**
 * Session header gym chip (#243). Renders nothing until the user has a gym,
 * so a lifter with one place never sees gym chrome. Quiet text + chevron
 * (meta tier), never a filled pill: it is context, not an action.
 */
export function SessionGymChip({ logId, onPress }: { logId: number; onPress: () => void }) {
  const { data: state } = useGymsState();
  const { data: gym } = useQuery(workoutGymQuery(logId));
  if (!state || state.gyms.length === 0) return null;
  const label = gym?.name ?? 'No gym';
  return (
    <Tappable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Gym: ${label}. Change gym for this workout`}
      className="mt-0.5 flex-row items-center gap-1 px-2 py-0.5">
      <Icon icon={MapPin} size={12} color="muted-foreground" />
      <Caption numberOfLines={1}>{label}</Caption>
      <Icon icon={ChevronDown} size={12} color="muted-foreground" />
    </Tappable>
  );
}

/** Retag the workout, then recompute suggestions (they step by the gym's plates). */
async function switchWorkoutGym(logId: number, gymUuid: string | null): Promise<boolean> {
  try {
    await setWorkoutGym(logId, gymUuid);
    await sessionEngine.refreshAssist();
    return true;
  } catch {
    return false;
  }
}

/** Gym picker for this workout. The pick also becomes the current gym. */
export function SessionGymSheet({
  logId,
  open,
  onOpenChange,
}: {
  logId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: state } = useGymsState();
  const { data: gym } = useQuery(workoutGymQuery(logId));
  const { toast } = useToast();
  const gyms = state?.gyms ?? [];
  const selected = gym?.uuid ?? null;

  const pick = (uuid: string | null) => {
    onOpenChange(false);
    if (uuid === selected) return;
    void switchWorkoutGym(logId, uuid).then((ok) => {
      if (!ok) toast({ title: 'Couldn’t change the gym', variant: 'destructive' });
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Gym for this workout" mode="fit">
      <ListGroup>
        {gyms.map((g) => (
          <ListRow
            key={g.uuid}
            title={g.name}
            subtitle={gymSummary(g)}
            onPress={() => pick(g.uuid)}
            accessibilityLabel={`${g.name}${g.uuid === selected ? ', selected' : ''}`}>
            {g.uuid === selected ? <Icon icon={Check} size={18} color="primary" /> : <View className="w-5" />}
          </ListRow>
        ))}
        <ListRow
          title="No gym"
          subtitle="Standard plates and bar"
          onPress={() => pick(null)}
          accessibilityLabel={`No gym${selected == null ? ', selected' : ''}`}>
          {selected == null ? <Icon icon={Check} size={18} color="primary" /> : <View className="w-5" />}
        </ListRow>
      </ListGroup>
      <Caption className="mt-3">Plates, bar and suggested jumps follow this gym. New workouts start here too.</Caption>
    </Sheet>
  );
}
