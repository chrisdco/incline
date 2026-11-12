import { useMemo } from 'react';
import { Alert, Share, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Download, Trash2 } from 'lucide-react-native';

import {
  dataUseProviderLabel,
  dataUseTaskLabel,
  exportDataUse,
  summarizeDataUse,
  useAiDataUse,
  type AiDataUseEntry,
} from '@/ai/data-use';
import { AI_DATA_CATEGORY_LABEL } from '@/contracts/ai/data-use';
import { Icon } from '@/components/common/icon';
import { Caption, Text } from '@/components/common/text';
import { ListGroup, ListRow, SectionLabel, StatBlock } from '@/components/layout';
import { Card } from '@/components/ui/card';
import { SCREEN_CONTENT } from '@/lib/layout';

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const tokens = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());

function EntryRow({ entry }: { entry: AiDataUseEntry }) {
  const sent = entry.categories.map((c) => AI_DATA_CATEGORY_LABEL[c] ?? c).join(', ');
  const usage =
    entry.inputTokens !== undefined || entry.outputTokens !== undefined
      ? ` · ${tokens((entry.inputTokens ?? 0) + (entry.outputTokens ?? 0))} tokens`
      : '';
  return (
    <View className="gap-0.5 py-3">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="min-w-0 flex-1 font-medium" numberOfLines={1}>
          {dataUseTaskLabel(entry.task)}
        </Text>
        <Caption className="text-xs">{when(entry.at)}</Caption>
      </View>
      <Caption numberOfLines={1}>
        {dataUseProviderLabel(entry.providerId)}
        {entry.model ? ` · ${entry.model}` : ''}
        {usage}
        {entry.outcome === 'ok' ? '' : ` · ${entry.outcome.replace('_', ' ')}`}
      </Caption>
      <Caption className="text-xs" numberOfLines={2}>
        Sent: {sent || 'nothing personal'}
      </Caption>
    </View>
  );
}

/**
 * "AI data use" (FOUNDATION-REVIEW G9): every request that left this phone for
 * an AI provider — what kind of data, to whom, when. Categories only; the
 * record never holds what was actually sent.
 */
export default function AiDataUseScreen() {
  const entries = useAiDataUse((s) => s.entries);
  const clear = useAiDataUse((s) => s.clear);
  const summary = useMemo(() => summarizeDataUse(entries), [entries]);

  const onExport = () => {
    void Share.share({ title: 'Incline AI data use', message: exportDataUse(entries) }).catch(() => undefined);
  };
  const onClear = () =>
    Alert.alert('Clear AI data use?', 'This removes the record on this phone. It does not change anything the providers keep.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clear },
    ]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <FlashList
        data={entries}
        keyExtractor={(e, i) => `${e.at}-${e.providerId}-${i}`}
        renderItem={({ item }) => (
          <View className="px-4">
            <EntryRow entry={item} />
          </View>
        )}
        ItemSeparatorComponent={() => <View className="mx-4 h-px bg-hairline" />}
        contentContainerStyle={{ ...SCREEN_CONTENT, paddingBottom: 24 }}
        ListHeaderComponent={
          <View className="mb-3">
            <Caption>
              Each time an AI feature asks a provider for an answer, it is listed here: the kind of data it carried, who
              received it, and when. Only on this phone; the content itself is never stored.
            </Caption>
            <Card className="mt-4 flex-row py-4">
              <StatBlock label="Requests" value={summary.requests} />
              <StatBlock label="Tokens" value={tokens(summary.inputTokens + summary.outputTokens)} />
              <StatBlock label="Providers" value={summary.providers.length} />
            </Card>
            {entries.length ? (
              <ListGroup className="mt-4">
                <ListRow icon={<Icon icon={Download} size={18} color="muted-foreground" />} title="Export" onPress={onExport} />
                <ListRow
                  icon={<Icon icon={Trash2} size={18} color="destructive" />}
                  title="Clear record"
                  tone="destructive"
                  onPress={onClear}
                />
              </ListGroup>
            ) : null}
            <SectionLabel className="mt-6">{entries.length ? 'Recent requests' : 'Nothing sent yet'}</SectionLabel>
          </View>
        }
      />
    </SafeAreaView>
  );
}
