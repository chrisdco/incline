import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from '@/components/common/styled';
import { ArrowLeft, Camera, Trash2 } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { EmptyState, ErrorState } from '@/components/common/states';
import { PrimaryActivityIndicator } from '@/components/common/primary-activity-indicator';
import { PhotoCompare } from '@/components/progress/photo-compare';
import { PhotoPickerSheet } from '@/components/progress/photo-picker-sheet';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Sheet } from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import {
  countProgressPhotos,
  deleteWorkoutPhoto,
  getProgressPhotoById,
  listProgressPhotos,
} from '@/db/queries';
import { PAGINATION } from '@/constants/config';
import { SCREEN_CONTENT } from '@/lib/layout';
import { useSettings } from '@/store/settings-store';
import type { ProgressPhoto } from '@/db/types';

const PAGE = PAGINATION.pageSize;

export default function ProgressPhotosScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const weekStartsOn = useSettings((s) => s.weekStartsOn);
  const { leftId: leftParam, rightId: rightParam } = useLocalSearchParams<{
    leftId?: string;
    rightId?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [total, setTotal] = useState(0);
  const [left, setLeft] = useState<ProgressPhoto | null>(null);
  const [right, setRight] = useState<ProgressPhoto | null>(null);
  const [pickerSide, setPickerSide] = useState<'left' | 'right' | null>(null);
  const [menuSide, setMenuSide] = useState<'left' | 'right' | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasMore = photos.length < total;

  const applyDefaults = useCallback(
    async (items: ProgressPhoto[], count: number) => {
      const earliest = items[0] ?? null;
      let latest = items.length > 0 ? items[items.length - 1] : null;
      if (count > items.length && count > 0) {
        const tail = await listProgressPhotos({ offset: count - 1, limit: 1 });
        latest = tail[0] ?? latest;
      }

      const requestedLeft = leftParam ? Number(leftParam) : NaN;
      const requestedRight = rightParam ? Number(rightParam) : NaN;
      const fromList = (id: number) => items.find((p) => p.id === id) ?? null;
      const resolvedLeft = Number.isFinite(requestedLeft)
        ? fromList(requestedLeft) ?? (await getProgressPhotoById(requestedLeft)) ?? earliest
        : earliest;
      let resolvedRight = Number.isFinite(requestedRight)
        ? fromList(requestedRight) ?? (await getProgressPhotoById(requestedRight)) ?? latest
        : latest;
      if (resolvedLeft && resolvedRight && resolvedRight.id === resolvedLeft.id) {
        resolvedRight =
          latest && latest.id !== resolvedLeft.id
            ? latest
            : items.find((p) => p.id !== resolvedLeft.id) ?? resolvedRight;
      }

      setLeft(resolvedLeft);
      setRight(resolvedRight);
    },
    [leftParam, rightParam],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [count, page] = await Promise.all([
        countProgressPhotos(),
        listProgressPhotos({ offset: 0, limit: PAGE }),
      ]);
      setTotal(count);
      setPhotos(page);
      await applyDefaults(page, count);
    } catch (e) {
      setError(e as Error);
      setPhotos([]);
      setLeft(null);
      setRight(null);
    }
    setLoading(false);
  }, [applyDefaults]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    setLeft((prev) => (prev ? photos.find((p) => p.id === prev.id) ?? prev : prev));
    setRight((prev) => (prev ? photos.find((p) => p.id === prev.id) ?? prev : prev));
  }, [photos]);

  const loadMore = () => {
    if (!hasMore || loading) return;
    void (async () => {
      const next = await listProgressPhotos({ offset: photos.length, limit: PAGE });
      setPhotos((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...next.filter((p) => !seen.has(p.id))];
      });
    })();
  };

  const menuPhoto = menuSide === 'right' ? right : left;

  const onDelete = async () => {
    if (!menuPhoto || deleting) return;
    setDeleting(true);
    try {
      await deleteWorkoutPhoto(menuPhoto.id);
      setDeleteOpen(false);
      setMenuSide(null);
      toast({ title: 'Photo deleted', variant: 'info' });
      await reload();
    } catch {
      toast({ title: 'Could not delete photo', variant: 'destructive' });
    }
    setDeleting(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Photos</Body>
        <View className="w-8" />
      </View>

      <View className="flex-1 px-4" style={{ paddingBottom: SCREEN_CONTENT.paddingBottom }}>
        {loading && photos.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <PrimaryActivityIndicator />
          </View>
        ) : error ? (
          <ErrorState onRetry={() => void reload()} />
        ) : total < 2 || !left || !right ? (
          <EmptyState
            icon={<Icon icon={Camera} size={28} color="muted-foreground" />}
            title="Need two photos"
            description="Attach gym pics on a finished workout summary, then come back to compare week vs week on this device."
          />
        ) : (
          <View className="mt-2">
            <Caption className="mb-4">Week vs week, on this device. Tap a photo to change it.</Caption>
            <PhotoCompare
              left={left}
              right={right}
              weekStartsOn={weekStartsOn}
              onChangeLeft={() => setPickerSide('left')}
              onChangeRight={() => setPickerSide('right')}
              onSwap={() => {
                setLeft(right);
                setRight(left);
              }}
              onOpenMenu={setMenuSide}
            />
          </View>
        )}
      </View>

      <PhotoPickerSheet
        open={pickerSide != null}
        onOpenChange={(open) => {
          if (!open) setPickerSide(null);
        }}
        title={pickerSide === 'right' ? 'Choose later photo' : 'Choose earlier photo'}
        photos={photos}
        selectedId={pickerSide === 'right' ? (right?.id ?? null) : (left?.id ?? null)}
        weekStartsOn={weekStartsOn}
        onPick={(photo) => {
          if (pickerSide === 'right') setRight(photo);
          else setLeft(photo);
          setPickerSide(null);
        }}
        onEndReached={loadMore}
      />

      <Sheet
        open={menuSide != null && !deleteOpen}
        onOpenChange={(open) => {
          if (!open) setMenuSide(null);
        }}
        title={menuPhoto?.workoutName ?? 'Photo'}
        mode="fit">
        <Pressable
          onPress={() => setDeleteOpen(true)}
          className="flex-row items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3"
          accessibilityRole="button"
          accessibilityLabel="Delete this photo">
          <Icon icon={Trash2} size={18} color="destructive" />
          <Body className="text-destructive">Delete photo</Body>
        </Pressable>
      </Sheet>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this photo?"
        description="It will be removed from this device. This cannot be undone."
        footer={
          <>
            <Button variant="outline" onPress={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onPress={() => void onDelete()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      />
    </SafeAreaView>
  );
}
