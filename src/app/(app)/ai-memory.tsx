import { useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, X } from 'lucide-react-native';

import { Icon } from '@/components/common/icon';
import { Caption, Text } from '@/components/common/text';
import { ListGroup, ListRow, SectionLabel } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Tappable } from '@/components/ui/tappable';
import { useToast } from '@/components/ui/toast';
import type { MemoryFact, MemoryKind } from '@/contracts/ai/chat';
import { MEMORY_KIND_LABEL, MEMORY_KINDS, MEMORY_TEXT_MAX } from '@/contracts/ai/memory';
import {
  clearMemoryFacts,
  forgetMemoryFact,
  restoreMemoryFact,
  saveMemoryFact,
  updateMemoryFact,
} from '@/db/queries/memory';
import { cn } from '@/lib/cn';
import { SCREEN_CONTENT } from '@/lib/layout';
import { memoryFactsQuery } from '@/lib/query-keys';

type Draft = { id: string | null; kind: MemoryKind; text: string };

/**
 * "What Incline knows" (AI-CHAT §5): every fact Ask uses, grouped by kind.
 * Suggested facts do nothing until confirmed. Edit, delete (undo), add,
 * clear all. Synced, so Claude (MCP) reads the same list.
 */
export default function AiMemoryScreen() {
  const { data: facts = [] } = useQuery(memoryFactsQuery);
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);

  const suggested = facts.filter((f) => f.status === 'suggested');
  const groups = useMemo(() => {
    const confirmed = facts.filter((f) => f.status === 'confirmed');
    return MEMORY_KINDS.map((k) => ({ kind: k, items: confirmed.filter((f) => f.kind === k) })).filter((g) => g.items.length > 0);
  }, [facts]);

  const forget = (f: MemoryFact) => {
    void forgetMemoryFact(f.id).then(() =>
      toast({ title: 'Removed from memory', action: { label: 'Undo', onPress: () => void restoreMemoryFact(f.id) } }),
    );
  };

  const onClear = () =>
    Alert.alert('Clear everything Incline remembers?', 'Ask and Claude stop using these facts. You can undo right after.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: () =>
          void clearMemoryFacts().then((ids) =>
            toast({
              title: `Cleared ${ids.length} ${ids.length === 1 ? 'fact' : 'facts'}`,
              action: { label: 'Undo', onPress: () => void Promise.all(ids.map(restoreMemoryFact)) },
            }),
          ),
      },
    ]);

  const save = async () => {
    if (!draft || !draft.text.trim()) return;
    if (draft.id) {
      await updateMemoryFact(draft.id, { text: draft.text, kind: draft.kind });
    } else {
      const r = await saveMemoryFact({ kind: draft.kind, text: draft.text, source: 'user', status: 'confirmed' });
      if (r.status === 'full') toast({ title: 'Memory is full', description: 'Remove a fact first.', variant: 'destructive' });
    }
    setDraft(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['bottom']}>
      <ScrollView contentContainerStyle={SCREEN_CONTENT} keyboardShouldPersistTaps="handled">
        <Caption className="mb-4 px-1">
          Ask uses these to tailor answers, and Claude can read them when connected. Say “remember…” in Ask, or add one here.
        </Caption>

        {suggested.length > 0 ? (
          <View className="mb-6">
            <SectionLabel>Suggested · not used until you confirm</SectionLabel>
            <ListGroup>
              {suggested.map((f) => (
                <ListRow
                  key={f.id}
                  title={f.text}
                  subtitle={MEMORY_KIND_LABEL[f.kind]}
                  onPress={() => setDraft({ id: f.id, kind: f.kind, text: f.text })}>
                  <View className="flex-row gap-1">
                    <Tappable
                      onPress={() => void updateMemoryFact(f.id, { status: 'confirmed' })}
                      accessibilityRole="button"
                      accessibilityLabel="Confirm"
                      className="h-11 w-11 items-center justify-center">
                      <Icon icon={Check} size={18} color="primary" />
                    </Tappable>
                    <Tappable
                      onPress={() => forget(f)}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss"
                      className="h-11 w-11 items-center justify-center">
                      <Icon icon={X} size={18} color="muted-foreground" />
                    </Tappable>
                  </View>
                </ListRow>
              ))}
            </ListGroup>
          </View>
        ) : null}

        {groups.map((g) => (
          <View key={g.kind} className="mb-6">
            <SectionLabel>{MEMORY_KIND_LABEL[g.kind]}</SectionLabel>
            <ListGroup>
              {g.items.map((f) => (
                <ListRow key={f.id} title={f.text} onPress={() => setDraft({ id: f.id, kind: f.kind, text: f.text })} />
              ))}
            </ListGroup>
          </View>
        ))}

        {facts.length === 0 ? (
          <View className="items-center gap-1 py-10">
            <Text className="font-medium">Nothing remembered yet</Text>
            <Caption className="text-center">Try “remember my left knee hurts on deep squats” in Ask.</Caption>
          </View>
        ) : null}

        <Button
          variant="tonal"
          leftIcon={<Icon icon={Plus} size={16} color="primary" />}
          onPress={() => setDraft({ id: null, kind: 'preference', text: '' })}>
          Add a fact
        </Button>
        {facts.length > 0 ? (
          <Button variant="ghost" className="mt-2" textClass="text-destructive" onPress={onClear}>
            Clear all
          </Button>
        ) : null}
      </ScrollView>

      <Sheet
        open={draft != null}
        onOpenChange={(o) => {
          if (!o) setDraft(null);
        }}
        title={draft?.id ? 'Edit fact' : 'Add a fact'}
        mode="fit">
        {draft ? (
          <View className="gap-3 pb-2">
            <View className="flex-row flex-wrap gap-2">
              {MEMORY_KINDS.map((k) => (
                <Tappable
                  key={k}
                  onPress={() => setDraft({ ...draft, kind: k })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: draft.kind === k }}
                  className={cn('rounded-full px-3 py-1.5', draft.kind === k ? 'bg-primary/15' : 'bg-surface2')}>
                  <Text className={cn('text-xs font-semibold', draft.kind === k ? 'text-primary-text' : 'text-muted-foreground')}>
                    {MEMORY_KIND_LABEL[k]}
                  </Text>
                </Tappable>
              ))}
            </View>
            <Input
              value={draft.text}
              onChangeText={(t) => setDraft({ ...draft, text: t })}
              placeholder="e.g. Left knee: no deep squats"
              maxLength={MEMORY_TEXT_MAX}
              multiline
              autoFocus
            />
            <Button onPress={() => void save()} disabled={!draft.text.trim()}>
              {draft.id ? 'Save' : 'Add'}
            </Button>
            {draft.id ? (
              <Button
                variant="ghost"
                textClass="text-destructive"
                onPress={() => {
                  const f = facts.find((x) => x.id === draft.id);
                  setDraft(null);
                  if (f) forget(f);
                }}>
                Delete
              </Button>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </SafeAreaView>
  );
}
