import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Settings } from 'lucide-react-native';

import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Caption } from '@/components/common/text';
import { Icon } from '@/components/common/icon';
import { REST_PRESETS } from '@/constants/rest-presets';
import { updateExerciseDefaultRest } from '@/db/queries';
import { useToast } from '@/components/ui/toast';

export function RestTimerPickerSheet({
  open,
  onOpenChange,
  currentValue,
  exerciseId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentValue: number;
  exerciseId?: number;
  onSelect: (seconds: number) => void;
}) {
  const [configuringDefault, setConfiguringDefault] = useState(false);
  const { toast } = useToast();

  const handleSetDefault = async (seconds: number) => {
    if (!exerciseId) return;
    try {
      await updateExerciseDefaultRest(exerciseId, seconds);
      toast({ title: 'Default rest updated', description: `Default set to ${seconds === 0 ? 'Off' : `${seconds}s`}`, variant: 'success' });
      setConfiguringDefault(false);
    } catch (e) {
      toast({ title: 'Could not save default', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={configuringDefault ? 'Default Rest Timer' : 'Rest Timer'}>
      {configuringDefault ? (
        <View>
          <Caption className="mb-3">
            Set the default rest timer for this exercise. It will auto-fill when you add this exercise to future sessions.
          </Caption>
          <View className="gap-2">
            {REST_PRESETS.map((p) => (
              <Pressable
                key={p.seconds}
                onPress={() => handleSetDefault(p.seconds)}
                className={cn(
                  'flex-row items-center justify-center rounded-xl py-3.5',
                  currentValue === p.seconds ? 'bg-primary' : 'bg-muted',
                )}>
                <Text className={cn('text-base font-medium', currentValue === p.seconds ? 'text-primary-foreground' : 'text-foreground')}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button variant="outline" className="mt-4" onPress={() => setConfiguringDefault(false)}>
            Back
          </Button>
        </View>
      ) : (
        <View>
          <View className="gap-2">
            {REST_PRESETS.map((p) => (
              <Pressable
                key={p.seconds}
                onPress={() => { onSelect(p.seconds); onOpenChange(false); }}
                className={cn(
                  'flex-row items-center justify-center rounded-xl py-3.5',
                  currentValue === p.seconds ? 'bg-primary' : 'bg-muted',
                )}>
                <Text className={cn('text-base font-medium', currentValue === p.seconds ? 'text-primary-foreground' : 'text-foreground')}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {exerciseId ? (
            <Pressable
              onPress={() => setConfiguringDefault(true)}
              className="mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-border py-3">
              <Icon icon={Settings} size={16} color="muted-foreground" />
              <Text className="text-sm font-medium text-muted-foreground">Set as exercise default</Text>
            </Pressable>
          ) : null}

          <Button variant="outline" className="mt-4" onPress={() => onOpenChange(false)}>
            Done
          </Button>
        </View>
      )}
    </Sheet>
  );
}
