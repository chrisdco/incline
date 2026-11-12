import { ScrollView, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MapPin, Plus } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption } from '@/components/common/text';
import { EmptyState } from '@/components/common/states';
import { ListSkeleton } from '@/components/common/skeleton';
import { ListGroup, ListRow, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { gymSummary } from '@/components/gyms/gym-format';
import { useGymsState } from '@/hooks/use-data';
import { SCREEN_CONTENT } from '@/lib/layout';

/**
 * Settings → Gyms (#243): each place you train, with its own bar and plates.
 * Tap a gym to edit it (name, unit, bar, plates, current, delete).
 */
export default function GymsScreen() {
  const router = useRouter();
  const { data, loading } = useGymsState();
  const gyms = data?.gyms ?? [];
  const currentUuid = data?.current?.uuid ?? null;
  const add = () => router.push('/(app)/gym/new' as Href);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={SCREEN_CONTENT}>
        {loading && data == null ? (
          <ListSkeleton />
        ) : gyms.length === 0 ? (
          <EmptyState
            icon={<Icon icon={MapPin} size={28} color="muted-foreground" />}
            title="No gyms yet"
            description="Train at more than one place? Add each gym's bar and plates so plate math and suggested jumps match the iron you have."
            actionLabel="Add a gym"
            onAction={add}
          />
        ) : (
          <>
            <Section title="Your gyms" className="mt-4">
              <ListGroup>
                {gyms.map((g) => (
                  <ListRow
                    key={g.uuid}
                    title={g.name}
                    subtitle={g.uuid === currentUuid ? `Current · ${gymSummary(g)}` : gymSummary(g)}
                    onPress={() => router.push(`/(app)/gym/${g.uuid}` as Href)}
                    accessibilityLabel={`${g.name}${g.uuid === currentUuid ? ', current gym' : ''}. Edit`}
                  />
                ))}
              </ListGroup>
              <Caption className="mt-2 px-1">
                New workouts are tagged with your current gym. Switch it from the workout screen.
              </Caption>
            </Section>
            <View className="mt-6">
              <Button variant="outline" leftIcon={<Icon icon={Plus} size={16} color="foreground" />} onPress={add}>
                Add gym
              </Button>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
