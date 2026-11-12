import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatThread } from '@/components/ai/chat-thread';
import { useQuery } from '@tanstack/react-query';
import { chatThreadsQuery } from '@/lib/query-keys';

/** An Ask thread. `id` is the thread uuid; a new one exists once the first question is saved. */
export default function ChatPage() {
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const { data: threads } = useQuery(chatThreadsQuery);
  const title = threads?.find((t) => t.uuid === id)?.title;
  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <Stack.Screen options={{ title: title || 'Ask' }} />
      <ChatThread threadUuid={id} initialQuestion={q} />
    </SafeAreaView>
  );
}
