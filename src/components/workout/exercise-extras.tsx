import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { MessageSquarePlus } from 'lucide-react-native';

import { Caption, Text } from '@/components/common/text';
import { Icon } from '@/components/common/icon';
import { saveSessionExerciseNote } from '@/db/queries';
import { sessionNotesQuery } from '@/lib/query-keys';
import { useToast } from '@/components/ui/toast';
import { calculatePlates } from '@/lib/plate-calculator';
import { kgToInput } from '@/lib/units';
import { METRIC_ICONS } from '@/lib/metric-icons';
import { PLACEHOLDER_COLOR } from '@/constants/config';
import { motionDuration } from '@/styles/motion';
import type { Unit } from '@/db/types';

/**
 * Per-exercise session note (Hevy parity). Reads its note from the session's
 * shared notes query (one query for every block, never per row), saves on
 * blur, blank notes delete the row. Local-only (no outbox).
 */
export function ExerciseNoteField({ logId, exerciseId }: { logId: number; exerciseId: number }) {
  const { data: notes } = useQuery(sessionNotesQuery(logId));
  const saved = notes?.[exerciseId] ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Shown until the shared query settles, so the row never pops in (#204).
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const note = optimistic ?? saved;
  const { toast } = useToast();

  const save = () => {
    const next = draft.trim();
    setOptimistic(next);
    saveSessionExerciseNote(logId, exerciseId, draft).then(
      () => setOptimistic(null),
      () => {
        setOptimistic(null);
        toast({ title: 'Couldn’t save the note', description: 'Your text is still in the editor.', variant: 'destructive' });
        setEditing(true);
      },
    );
  };

  const open = () => {
    setDraft(note);
    setEditing(true);
  };

  if (!editing) {
    return (
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={note ? 'Edit exercise note' : 'Add exercise note'}
        hitSlop={6}
        style={{ minHeight: 24 }}
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
    <Animated.View
      entering={FadeIn.duration(motionDuration.state)}
      exiting={FadeOut.duration(motionDuration.feedback)}
      className="gap-1 rounded-xl bg-muted/60 px-3 py-2">
      <TextInput
        value={draft}
        onChangeText={setDraft}
        // No autoFocus: focusing on mount pops the keyboard and yanks scroll
        // the instant "Add note" is tapped. Editor opens in place (position
        // stays); keyboard + minimal OS scroll happen on tap into the field.
        multiline
        placeholder="Cues, feel, setup details…"
        placeholderTextColor={PLACEHOLDER_COLOR}
        // Save on blur but STAY mounted: the session ScrollView dismisses the
        // keyboard on drag, and unmounting here closed the editor mid-typing
        // with no way back except re-tap. Explicit Done collapses it.
        onBlur={save}
        accessibilityLabel="Exercise note"
        style={{ minHeight: 36, paddingVertical: 6, fontSize: 13 }}
        className="text-foreground"
      />
      <Pressable
        onPress={() => {
          setEditing(false);
          save();
        }}
        accessibilityRole="button"
        accessibilityLabel="Done editing exercise note"
        hitSlop={8}
        className="self-end rounded-xl bg-primary/15 px-3 py-1.5">
        <Text className="text-xs font-semibold text-primary-text">Done</Text>
      </Pressable>
    </Animated.View>
  );
}

/**
 * One-line plate breakdown for the active working set on barbells.
 * Read-only hint — the full calculator stays in tools.
 */
/**
 * Plate breakdown for the active barbell set. Equipment comes from the
 * session (one catalog read for every block, #173), never a per-row query.
 */
export function PlatesHint({
  equipment,
  weight,
  unit,
}: {
  equipment: string | null | undefined;
  weight: number;
  unit: Unit;
}) {
  if (equipment !== 'barbell' || weight <= 0) return null;
  // `weight` is canonical kg; plates are loaded in the display unit.
  const shown = kgToInput(weight, unit);
  const bar = unit === 'metric' ? 20 : 45;
  if (shown <= bar) return null;
  const result = calculatePlates(shown, unit === 'metric' ? 'kg' : 'lb', bar);
  if (!result) return null;
  const breakdown =
    result.plates.length === 0
      ? 'Bar only'
      : `${result.plates.map((p) => `${p.count}×${p.weight}`).join(' + ')} /side`;
  const short = result.remainderPerSide > 0 ? ` · ${result.remainderPerSide * 2} ${unit === 'metric' ? 'kg' : 'lb'} short` : '';

  return (
    <View className="flex-row items-center gap-1.5 px-1 py-0.5">
      <Icon icon={METRIC_ICONS.equipment} size={13} color="muted-foreground" />
      <Caption>
        {bar} bar · {breakdown}{short}
      </Caption>
    </View>
  );
}
