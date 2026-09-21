import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from 'react-native-gesture-handler';
import { MessageSquarePlus } from 'lucide-react-native';

import { Caption } from '@/components/common/text';
import { Icon } from '@/components/common/icon';
import { Text } from '@/components/ui/text';
import { getExercise, getSessionExerciseNote, saveSessionExerciseNote } from '@/db/queries';
import { calculatePlates } from '@/lib/plate-calculator';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { PLACEHOLDER_COLOR } from '@/constants/config';
import type { Unit } from '@/db/types';

/**
 * Per-exercise session note (Hevy parity). Self-contained: loads on mount,
 * saves on blur, blank notes delete the row. Local-only (no outbox).
 */
export function ExerciseNoteField({ logId, exerciseId }: { logId: number; exerciseId: number }) {
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let active = true;
    void getSessionExerciseNote(logId, exerciseId).then((n) => {
      if (!active) return;
      setNote(n);
      setDraft(n);
    });
    return () => {
      active = false;
    };
  }, [logId, exerciseId]);

  if (note == null) return null;

  if (!editing) {
    return (
      <Pressable
        onPress={() => setEditing(true)}
        accessibilityRole="button"
        accessibilityLabel={note ? 'Edit exercise note' : 'Add exercise note'}
        hitSlop={6}
        className="flex-row items-center gap-1.5 px-1 py-0.5">
        <Icon icon={MessageSquarePlus} size={13} color={note ? 'primary' : 'muted-foreground'} />
        {note ? (
          <Text className="flex-1 text-xs text-foreground" numberOfLines={2}>{note}</Text>
        ) : (
          <Caption>Add note</Caption>
        )}
      </Pressable>
    );
  }

  return (
    <TextInput
      value={draft}
      onChangeText={setDraft}
      autoFocus
      multiline
      placeholder="Cues, feel, setup details…"
      placeholderTextColor={PLACEHOLDER_COLOR}
      onBlur={() => {
        setEditing(false);
        setNote(draft.trim());
        void saveSessionExerciseNote(logId, exerciseId, draft).catch(() => {});
      }}
      accessibilityLabel="Exercise note"
      style={{ minHeight: 36, paddingVertical: 6, fontSize: 13 }}
      className="rounded-xl bg-muted/60 px-3 text-foreground"
    />
  );
}

/**
 * One-line plate breakdown for the active working set on barbells.
 * Read-only hint — the full calculator stays in tools.
 */
export function PlatesHint({
  exerciseId,
  weight,
  unit,
}: {
  exerciseId: number;
  weight: number;
  unit: Unit;
}) {
  const [equipment, setEquipment] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getExercise(exerciseId).then((ex) => {
      if (active) setEquipment(ex?.equipment ?? null);
    });
    return () => {
      active = false;
    };
  }, [exerciseId]);

  if (equipment !== 'barbell' || weight <= 0) return null;
  const bar = unit === 'metric' ? 20 : 45;
  if (weight <= bar) return null;
  const result = calculatePlates(weight, unit === 'metric' ? 'kg' : 'lb', bar);
  if (!result) return null;
  const breakdown =
    result.plates.length === 0
      ? 'Bar only'
      : `${result.plates.map((p) => `${p.count}×${p.weight}`).join(' + ')} /side`;

  return (
    <View className="flex-row items-center gap-1.5 px-1 py-0.5">
      <Icon icon={METRIC_ICONS.equipment} size={13} color="muted-foreground" />
      <Caption>
        {bar} bar · {breakdown}
      </Caption>
    </View>
  );
}
