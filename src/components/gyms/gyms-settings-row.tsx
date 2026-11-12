import { useRouter, type Href } from 'expo-router';
import { MapPin } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { ListRow } from '@/components/layout';
import { useGymsState } from '@/hooks/use-data';

/** Settings → Gyms (#243). Its own read so Settings itself stays untouched. */
export function GymsSettingsRow() {
  const router = useRouter();
  const { data } = useGymsState();
  const count = data?.gyms.length ?? 0;
  const subtitle =
    count === 0
      ? 'Plates and bar for each place you train'
      : data?.current
        ? `${data.current.name}${count > 1 ? ` · ${count} gyms` : ''}`
        : `${count} gym${count === 1 ? '' : 's'} · none current`;
  return (
    <ListRow
      icon={<Icon icon={MapPin} size={18} color="muted-foreground" />}
      title="Gyms"
      subtitle={subtitle}
      onPress={() => router.push('/(app)/gyms' as Href)}
    />
  );
}
