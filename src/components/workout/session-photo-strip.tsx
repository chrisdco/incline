import { Alert, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImagePlus, X } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption } from '@/components/common/text';
import type { WorkoutPhoto } from '@/db/types';
import { MAX_SESSION_PHOTOS } from '@/db/queries';

export function SessionPhotoStrip({
  photos,
  onAdd,
  onRemove,
}: {
  photos: WorkoutPhoto[];
  onAdd: (uris: string[]) => void;
  onRemove: (photoId: number) => void;
}) {
  const remaining = MAX_SESSION_PHOTOS - photos.length;

  const pick = async (source: 'library' | 'camera') => {
    if (remaining <= 0) return;
    if (source === 'camera') {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== 'granted') {
        Alert.alert('Permission needed', 'Allow camera access to snap a gym pic.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      onAdd(result.assets.map((a) => a.uri));
      return;
    }
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (lib.status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to attach a gym pic.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;
    onAdd(result.assets.map((a) => a.uri));
  };

  const promptAdd = () => {
    if (remaining <= 0) {
      Alert.alert('Photo limit', `You can add up to ${MAX_SESSION_PHOTOS} photos on a session.`);
      return;
    }
    Alert.alert('Add photo', 'Attach a gym pic to this session.', [
      { text: 'Camera', onPress: () => void pick('camera') },
      { text: 'Library', onPress: () => void pick('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View className="mb-3">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
        {photos.map((p) => (
          <View key={p.id} className="relative">
            <Image
              source={{ uri: p.uri }}
              style={{ width: 88, height: 88, borderRadius: 14 }}
              contentFit="cover"
            />
            <Pressable
              onPress={() => onRemove(p.id)}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/60">
              {/* Fixed white on the black/60 scrim over a photo — not a theme color. */}
              <Icon icon={X} size={12} color="#ffffff" />
            </Pressable>
          </View>
        ))}
        {remaining > 0 ? (
          <Pressable
            onPress={promptAdd}
            accessibilityRole="button"
            accessibilityLabel="Add session photo"
            className="h-[88px] w-[88px] items-center justify-center rounded-2xl border border-dashed border-border bg-card">
            <Icon icon={photos.length === 0 ? ImagePlus : Camera} size={20} color="muted-foreground" />
            <Caption className="mt-1">{photos.length === 0 ? 'Add photo' : 'Add'}</Caption>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
