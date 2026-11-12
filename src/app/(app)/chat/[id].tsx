import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ellipsis } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { ChatThread } from '@/components/ai/chat-thread';
import { Icon } from '@/components/common/icon';
import { Tappable } from '@/components/ui/tappable';
import { deleteChatThread } from '@/db/queries/chat';
import { chatThreadsQuery } from '@/lib/query-keys';

/** An Ask thread. `id` is the thread uuid; a new one exists once the first question is saved. */
export default function ChatPage() {
  const router = useRouter();
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const { data: threads } = useQuery(chatThreadsQuery);
  const thread = threads?.find((t) => t.uuid === id);
  const menu = () =>
    Alert.alert(thread?.title || 'Chat', 'Chats are stored on this device only.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete chat',
        style: 'destructive',
        onPress: () => {
          void deleteChatThread(id).then(() => router.back());
        },
      },
    ]);
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: thread?.title || 'Ask',
          headerRight: thread
            ? () => (
                <Tappable onPress={menu} pressedOpacity={0.55} accessibilityRole="button" accessibilityLabel="Chat options" hitSlop={8} className="px-2">
                  <Icon icon={Ellipsis} size={22} color="foreground" />
                </Tappable>
              )
            : undefined,
        }}
      />
      <ChatThread threadUuid={id} initialQuestion={q} />
    </SafeAreaView>
  );
}
