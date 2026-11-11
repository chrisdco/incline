import { HardDrive } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { ListRow } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  PHOTO_STORAGE_TABLES,
  formatPhotoStorage,
  getPhotoStorageStats,
  retryStuckPhotoTransfers,
} from '@/db/queries/photo-storage';
import { useDbQuery } from '@/hooks/use-data';

/**
 * Settings readout (#193): photo count + MB on this device, one aggregate
 * query keyed by the photo tables (a photo write invalidates it). When
 * uploads/deletes are parked after repeated failures, offers a retry.
 */
export function PhotoStorageRow() {
  const { toast } = useToast();
  const { data } = useDbQuery(PHOTO_STORAGE_TABLES, ['photoStorage'], getPhotoStorageStats);
  const stuck = data?.stuck ?? 0;
  const subtitle = data
    ? stuck > 0
      ? `${formatPhotoStorage(data)} · ${stuck} stuck`
      : formatPhotoStorage(data)
    : ' ';

  const retry = async () => {
    await retryStuckPhotoTransfers();
    toast({ title: 'Retrying on next sync', variant: 'info' });
  };

  return (
    <ListRow
      icon={<Icon icon={HardDrive} size={18} color="muted-foreground" />}
      title="Photo storage"
      subtitle={subtitle}>
      {stuck > 0 ? (
        <Button size="sm" variant="outline" onPress={() => void retry()}>
          Retry
        </Button>
      ) : null}
    </ListRow>
  );
}
