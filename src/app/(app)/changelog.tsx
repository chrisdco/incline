import { FlashList } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { Activity } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Icon as Glyph } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { Badge } from '@/components/ui/badge';
import { Tappable } from '@/components/ui/tappable';
import { WHATS_NEW_ICONS } from '@/components/whats-new/icons';
import { changelog, levelOf, newDotIds, type WhatsNewItem } from '@/contracts/releases/whats-new';
import { SCREEN_CONTENT } from '@/lib/layout';
import { useSettings } from '@/store/settings-store';

type Row = { kind: 'day'; date: string } | { kind: 'item'; item: WhatsNewItem };

const ROWS: Row[] = changelog().flatMap((d) => [
  { kind: 'day', date: d.date } as Row,
  ...d.items.map((item) => ({ kind: 'item', item }) as Row),
]);

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * What's new history (#410): every item in the pack, one group per day,
 * cards before notes. Opening it clears the New dot: the dotted ids are
 * captured for this visit (so they still read "New" here) and marked seen.
 * Same `changelog()` as the web dashboard.
 */
export default function ChangelogScreen() {
  const router = useRouter();
  const dismiss = useSettings((s) => s.dismissAnnouncement);
  const [fresh] = useState(() => new Set(newDotIds(useSettings.getState().dismissedAnnouncementIds, Date.now())));

  useEffect(() => {
    for (const id of fresh) dismiss(id);
  }, [fresh, dismiss]);

  return (
    <View className="flex-1 bg-background">
      <FlashList
        data={ROWS}
        keyExtractor={(r) => (r.kind === 'day' ? `d-${r.date}` : r.item.id)}
        getItemType={(r) => r.kind}
        contentContainerStyle={SCREEN_CONTENT}
        renderItem={({ item: r }) =>
          r.kind === 'day' ? (
            <Caption className="pb-2 pt-5 font-semibold uppercase tracking-wide">{dayLabel(r.date)}</Caption>
          ) : (
            <ChangelogRow
              item={r.item}
              isNew={fresh.has(r.item.id)}
              onOpen={r.item.href ? () => router.push(r.item.href as Href) : undefined}
            />
          )
        }
      />
    </View>
  );
}

function ChangelogRow({ item, isNew, onOpen }: { item: WhatsNewItem; isNew: boolean; onOpen?: () => void }) {
  const Icon = WHATS_NEW_ICONS[item.icon] ?? Activity;
  const level = levelOf(item);
  const body = (
    <View className="flex-row gap-3 py-2.5">
      <View className={level === 'note' ? 'size-8 items-center justify-center rounded-xl bg-muted' : 'size-8 items-center justify-center rounded-xl bg-primary/10'}>
        <Glyph icon={Icon} size={16} color={level === 'note' ? 'muted-foreground' : 'primary'} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-2">
          <Body className="font-semibold text-foreground">{item.title}</Body>
          {level === 'must-read' ? <Badge variant="warning">Important</Badge> : isNew ? <Badge>New</Badge> : null}
        </View>
        <Caption>{item.body}</Caption>
        {item.native ? <Caption>Needs the latest app build</Caption> : null}
      </View>
    </View>
  );
  if (!onOpen) return body;
  return (
    <Tappable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.cta ?? 'Open'}`}>
      {body}
    </Tappable>
  );
}
