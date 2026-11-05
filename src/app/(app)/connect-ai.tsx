import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bot, Eye, PencilOff, Plus, Share2, Trash2 } from 'lucide-react-native';

import { useAppAuth } from '@/auth/use-app-auth';
import { Chip } from '@/components/common/chip';
import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { ListRow, SectionLabel } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { SCREEN_CONTENT } from '@/lib/layout';
import {
  claudeCodeCommand,
  createMcpToken,
  listMcpTokens,
  mcpErrorCopy,
  mcpServerUrl,
  revokeMcpToken,
  type McpToken,
} from '@/lib/mcp-tokens';

/**
 * Connect AI apps (MCP, #242). Big apps (GitHub, Linear, Notion) do this as
 * "personal access tokens": name it, see it once, revoke any time. The server
 * only allows reads plus creating new routines, so a leaked token can't wipe
 * anything. Tokens are remote state, so this screen reads them live.
 */
const CLIENTS = ['Claude Code', 'Claude Desktop', 'Cursor', 'Other'] as const;
const TOKENS_KEY = ['mcp_tokens'] as const;

function usedLabel(t: McpToken): string {
  const made = new Date(t.created_at).toLocaleDateString();
  return t.last_used_at ? `Last used ${new Date(t.last_used_at).toLocaleDateString()}` : `Added ${made} · not used yet`;
}

export default function ConnectAiScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isSignedIn, getToken } = useAppAuth();
  const [label, setLabel] = useState<(typeof CLIENTS)[number]>('Claude Code');
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ token: string; label: string } | null>(null);

  const tokens = useQuery({
    queryKey: TOKENS_KEY,
    queryFn: () => listMcpTokens(getToken),
    enabled: isSignedIn && mcpServerUrl() !== null,
  });

  const onCreate = async () => {
    if (creating) return;
    setCreating(true);
    const res = await createMcpToken(getToken, label);
    setCreating(false);
    if (!res.ok) {
      toast({ title: mcpErrorCopy(res.error), variant: 'destructive' });
      return;
    }
    setFresh({ token: res.token, label: res.label });
    void queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
  };

  const onShare = (token: string) => {
    void Share.share({ message: `${claudeCodeCommand(token)}\n\nServer: ${mcpServerUrl()}\nHeader: Authorization: Bearer ${token}` });
  };

  const onRevoke = (t: McpToken) => {
    Alert.alert(`Disconnect ${t.label}?`, 'It stops working right away. You can connect it again with a new code.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          void revokeMcpToken(getToken, t.id).then((ok) => {
            if (!ok) toast({ title: 'Could not disconnect. Try again.', variant: 'destructive' });
            void queryClient.invalidateQueries({ queryKey: TOKENS_KEY });
          });
        },
      },
    ]);
  };

  const list = tokens.data ?? [];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-row items-center gap-3 px-4 pb-2 pt-3">
        <Pressable onPress={() => router.back()} className="p-1" accessibilityRole="button" accessibilityLabel="Go back">
          <Icon icon={ArrowLeft} size={24} color="foreground" />
        </Pressable>
        <Body className="text-base font-semibold text-foreground">Connect AI apps</Body>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ ...SCREEN_CONTENT, paddingBottom: 40 }}>
        <Card>
          <View className="gap-3 py-3">
            <View className="flex-row items-start gap-3">
              <Icon icon={Eye} size={18} color="muted-foreground" />
              <Caption className="min-w-0 flex-1">
                Ask Claude and other AI apps about your workouts, records and weekly volume.
              </Caption>
            </View>
            <View className="flex-row items-start gap-3">
              <Icon icon={PencilOff} size={18} color="muted-foreground" />
              <Caption className="min-w-0 flex-1">
                They can save new routines for you, but can’t change or delete anything.
              </Caption>
            </View>
          </View>
        </Card>

        {fresh ? (
          <>
            <SectionLabel className="mt-6">{`${fresh.label} code`}</SectionLabel>
            <Card>
              <View className="gap-3 py-3">
                <Caption>Shown once. Anyone with this code can read your training data, so share it only with your own apps.</Caption>
                <Body selectable className="font-mono text-foreground">
                  {fresh.token}
                </Body>
                <Button size="sm" onPress={() => onShare(fresh.token)} leftIcon={<Icon icon={Share2} size={16} color="primary-foreground" />}>
                  Share setup
                </Button>
                <Caption>
                  Claude Code: run the shared command in a terminal. Other apps: add a remote MCP server with the address and
                  Authorization header from the shared text.
                </Caption>
                <Chip label="Done" size="sm" onPress={() => setFresh(null)} />
              </View>
            </Card>
          </>
        ) : null}

        <SectionLabel className="mt-6">Connected</SectionLabel>
        <Card>
          {list.length === 0 ? (
            <Caption className="py-3">{tokens.isError ? 'Could not load connections.' : tokens.isLoading ? 'Loading…' : 'No AI apps connected yet.'}</Caption>
          ) : (
            list.map((t) => (
              <ListRow key={t.id} icon={<Icon icon={Bot} size={18} color="muted-foreground" />} title={t.label} subtitle={usedLabel(t)}>
                <Pressable onPress={() => onRevoke(t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Disconnect ${t.label}`}>
                  <Icon icon={Trash2} size={18} color="destructive" />
                </Pressable>
              </ListRow>
            ))
          )}
        </Card>

        <SectionLabel className="mt-6">New connection</SectionLabel>
        <Card>
          <View className="gap-3 py-3">
            <View className="flex-row flex-wrap gap-1.5">
              {CLIENTS.map((c) => (
                <Chip key={c} size="sm" label={c} selected={label === c} onPress={() => setLabel(c)} />
              ))}
            </View>
            <Button
              size="sm"
              onPress={() => void onCreate()}
              loading={creating}
              disabled={!isSignedIn}
              leftIcon={<Icon icon={Plus} size={16} color="primary-foreground" />}>
              {`Connect ${label}`}
            </Button>
            {!isSignedIn ? <Caption>Sign in to connect AI apps.</Caption> : null}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
