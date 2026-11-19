import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import {
  restoreTemplateVersion,
  VERSION_REASON_LABELS,
  type TemplateVersion,
} from '@/db/queries/routine-versions';
import { templateVersionsQuery } from '@/lib/query-keys';

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function shape(v: TemplateVersion): string {
  if (v.exercises.length === 0) return 'No exercises';
  return v.exercises.map((e) => `${e.name} ×${e.sets}`).join(' · ');
}

/**
 * Earlier states of a routine, newest first (docs/decisions/ROUTINE-CHANGES.md).
 * Restoring saves the current state first, so it shows up here and a
 * restore can be undone the same way.
 */
export function RoutineHistorySheet({
  templateId,
  open,
  onOpenChange,
  onRestored,
}: {
  templateId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => void;
}) {
  const { data: versions = [] } = useQuery({ ...templateVersionsQuery(templateId), enabled: open });
  const [confirm, setConfirm] = useState<TemplateVersion | null>(null);
  const [restoring, setRestoring] = useState(false);
  const { toast } = useToast();

  const restore = async () => {
    if (!confirm) return;
    setRestoring(true);
    const ok = await restoreTemplateVersion(confirm.id).catch(() => false);
    setRestoring(false);
    setConfirm(null);
    if (!ok) {
      toast({ title: 'Could not restore that version', variant: 'destructive' });
      return;
    }
    onOpenChange(false);
    onRestored();
    toast({ title: `Restored the version from ${when(confirm.createdAt)}`, variant: 'success' });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title="Version history" mode="half">
        <ScrollView contentContainerClassName="gap-3 pb-6">
          {versions.length === 0 ? (
            <Caption className="py-6 text-center">
              No earlier versions yet. When a workout updates this routine, the version before it is kept here.
            </Caption>
          ) : (
            versions.map((v) => (
              <View key={v.id} className="gap-2 rounded-2xl bg-surface2 p-3">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Body className="font-medium text-foreground">{when(v.createdAt)}</Body>
                    <Caption>{VERSION_REASON_LABELS[v.reason]}</Caption>
                  </View>
                  <Button size="sm" variant="tonal" onPress={() => setConfirm(v)} accessibilityLabel={`Restore the version from ${when(v.createdAt)}`}>
                    Restore
                  </Button>
                </View>
                <Caption numberOfLines={3}>{shape(v)}</Caption>
              </View>
            ))
          )}
        </ScrollView>
      </Sheet>
      <Dialog
        open={confirm != null}
        onOpenChange={(o) => { if (!o && !restoring) setConfirm(null); }}
        title="Restore this version?"
        description="The routine goes back to how it was then. Its current state is kept in this history, so you can switch back. Past workouts don't change."
        footer={
          <>
            <Button variant="outline" onPress={() => setConfirm(null)} disabled={restoring}>Cancel</Button>
            <Button onPress={() => { void restore(); }} loading={restoring} disabled={restoring}>Restore</Button>
          </>
        }
      />
    </>
  );
}
