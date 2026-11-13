import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ellipsis } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';

import { AskAmbientBand } from '@/components/ai/ask-ambient';
import { ChatThread } from '@/components/ai/chat-thread';
import { Icon } from '@/components/common/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Tappable } from '@/components/ui/tappable';
import { deleteChatThread, MAX_TITLE, renameChatThread } from '@/db/queries/chat';
import { chatThreadsQuery } from '@/lib/query-keys';

/** An Ask thread. `id` is the thread uuid; a new one exists once the first question is saved. */
export default function ChatPage() {
  const router = useRouter();
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const { data: threads } = useQuery(chatThreadsQuery);
  const thread = threads?.find((t) => t.uuid === id);
  const [renaming, setRenaming] = useState<string | null>(null);

  const saveName = () => {
    if (renaming === null) return;
    void renameChatThread(id, renaming);
    setRenaming(null);
  };
  const menu = () =>
    Alert.alert(thread?.title || 'Chat', 'Chats are stored on this device only.', [
      { text: 'Rename', onPress: () => setRenaming(thread?.title ?? '') },
      {
        text: 'Delete chat',
        style: 'destructive',
        onPress: () => {
          void deleteChatThread(id).then(() => router.back());
        },
      },
      { text: 'Cancel', style: 'cancel' },
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
      <AskAmbientBand />
      <ChatThread threadUuid={id} initialQuestion={q} />

      <Sheet open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)} title="Rename chat" mode="fit">
        <View className="gap-4 pb-4">
          <Input
            value={renaming ?? ''}
            onChangeText={setRenaming}
            maxLength={MAX_TITLE}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={saveName}
            accessibilityLabel="Chat name"
          />
          <Button onPress={saveName}>Save</Button>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}
