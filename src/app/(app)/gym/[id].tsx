import { useLayoutEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Caption } from '@/components/common/text';
import { Chip } from '@/components/common/chip';
import { ListSkeleton } from '@/components/common/skeleton';
import { ErrorState } from '@/components/common/states';
import { ListGroup, ListRow, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { formatPlate, gymUnitLabel } from '@/components/gyms/gym-format';
import {
  createGym,
  defaultGymEquipment,
  deleteGym,
  plateUnitOf,
  restoreGym,
  updateGym,
  type GymInput,
} from '@/db/queries';
import type { Gym, Unit } from '@/db/types';
import { useGymsState } from '@/hooks/use-data';
import { standardPlates } from '@/lib/plate-calculator';
import { SCREEN_CONTENT } from '@/lib/layout';
import { useSettings } from '@/store/settings-store';

/* Writes live in module helpers (no try/catch in component bodies: React Compiler). */

async function saveGym(uuid: string | null, input: GymInput, current: boolean): Promise<boolean> {
  try {
    if (uuid) await updateGym(uuid, input, { current });
    else await createGym(input, { makeCurrent: current });
    return true;
  } catch {
    return false;
  }
}

async function removeGym(uuid: string): Promise<{ wasCurrent: boolean } | null> {
  try {
    return await deleteGym(uuid);
  } catch {
    return null;
  }
}

/** Add (`/gym/new`) or edit (`/gym/<uuid>`) a gym. */
export default function GymEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const navigation = useNavigation();
  const globalUnit = useSettings((s) => s.unit);
  const { data, loading, error, refetch } = useGymsState();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: true, title: isNew ? 'New gym' : 'Edit gym' });
  }, [navigation, isNew]);

  if (isNew) {
    // The first gym is current by default; later ones opt in.
    return <GymForm gym={null} defaultUnit={globalUnit} startCurrent={(data?.gyms.length ?? 0) === 0} />;
  }
  if (loading && data == null) {
    return (
      <View className="flex-1 bg-background p-4">
        <ListSkeleton count={3} />
      </View>
    );
  }
  const gym = data?.gyms.find((g) => g.uuid === id) ?? null;
  if (error || !gym) {
    return <ErrorState title="Gym not found" description="It may have been deleted." onRetry={refetch} />;
  }
  return <GymForm key={gym.uuid} gym={gym} defaultUnit={gym.unit} startCurrent={data?.current?.uuid === gym.uuid} />;
}

function GymForm({ gym, defaultUnit, startCurrent }: { gym: Gym | null; defaultUnit: Unit; startCurrent: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(gym?.name ?? '');
  const [unit, setUnit] = useState<Unit>(gym?.unit ?? defaultUnit);
  const [bar, setBar] = useState(() => formatPlate(gym?.barWeight ?? defaultGymEquipment(defaultUnit).barWeight));
  const [plates, setPlates] = useState<number[]>(() => gym?.plates ?? defaultGymEquipment(defaultUnit).plates);
  const [current, setCurrent] = useState(startCurrent);
  const [saving, setSaving] = useState(false);
  const u = gymUnitLabel(unit);
  const standard = standardPlates(plateUnitOf(unit));

  const changeUnit = (next: Unit) => {
    if (next === unit) return;
    // Plates and bars are different iron per unit: start from the standard set.
    const eq = defaultGymEquipment(next);
    setUnit(next);
    setBar(formatPlate(eq.barWeight));
    setPlates(eq.plates);
  };

  const togglePlate = (p: number) => {
    if (plates.includes(p)) {
      if (plates.length === 1) {
        toast({ title: 'Keep at least one plate size', variant: 'warning' });
        return;
      }
      setPlates(plates.filter((x) => x !== p));
    } else {
      setPlates([...plates, p].sort((a, b) => b - a));
    }
  };

  const barNum = Number(bar.replace(',', '.'));
  const barValid = bar.trim() !== '' && Number.isFinite(barNum) && barNum >= 0;
  const canSave = name.trim().length > 0 && barValid && !saving;

  const save = async () => {
    setSaving(true);
    const ok = await saveGym(gym?.uuid ?? null, { name, unit, barWeight: barNum, plates }, current);
    setSaving(false);
    if (!ok) {
      toast({ title: 'Couldn’t save the gym', variant: 'destructive' });
      return;
    }
    router.back();
  };

  const remove = async () => {
    if (!gym) return;
    const res = await removeGym(gym.uuid);
    if (!res) {
      toast({ title: 'Couldn’t delete the gym', variant: 'destructive' });
      return;
    }
    router.back();
    toast({
      title: `Deleted ${gym.name}`,
      description: 'Past workouts keep their gym tag.',
      action: {
        label: 'Undo',
        onPress: () => {
          void restoreGym(gym.uuid, { makeCurrent: res.wasCurrent }).catch(() => {
            toast({ title: 'Couldn’t restore the gym', variant: 'destructive' });
          });
        },
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={SCREEN_CONTENT}>
        <Section title="Name" className="mt-4">
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Home, Commercial, Hotel…"
            autoCapitalize="words"
            accessibilityLabel="Gym name"
          />
        </Section>

        <Section title="Equipment">
          <ListGroup>
            <ListRow title="Unit" subtitle="The plates on this gym's floor">
              <View className="flex-row gap-2">
                <Chip label="kg" selected={unit === 'metric'} onPress={() => changeUnit('metric')} />
                <Chip label="lb" selected={unit === 'imperial'} onPress={() => changeUnit('imperial')} />
              </View>
            </ListRow>
            <ListRow title={`Bar (${u})`} subtitle="Counted in every plate breakdown">
              <Input
                value={bar}
                onChangeText={setBar}
                keyboardType="decimal-pad"
                accessibilityLabel={`Bar weight in ${u}`}
                className="w-24 text-right tabular-nums"
              />
            </ListRow>
            <ListRow stacked title={`Plates (${u})`} subtitle="Tap the sizes this gym has">
              <View className="flex-row flex-wrap gap-2">
                {standard.map((p) => (
                  <Chip key={p} label={formatPlate(p)} selected={plates.includes(p)} onPress={() => togglePlate(p)} />
                ))}
              </View>
            </ListRow>
          </ListGroup>
          <Caption className="mt-2 px-1">
            Without small plates, suggested jumps get bigger (no 1.25s means 5 {u} steps).
          </Caption>
        </Section>

        <Section title="Current gym">
          <ListGroup>
            <ListRow title="Train here now" subtitle="New workouts are tagged with this gym">
              <Switch value={current} onValueChange={setCurrent} accessibilityLabel="Set as current gym" />
            </ListRow>
          </ListGroup>
        </Section>

        <Button className="mt-8" onPress={() => void save()} disabled={!canSave} loading={saving}>
          {gym ? 'Save' : 'Add gym'}
        </Button>

        {gym ? (
          <Section title="Danger zone">
            <ListGroup>
              <ListRow tone="destructive" title="Delete gym" onPress={() => void remove()} accessibilityLabel={`Delete ${gym.name}`} />
            </ListGroup>
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
