import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Caption } from '@/components/common/text';
import { ListRow, Section } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/toast';
import { decisionSourceLabel, REMEDY_LABEL } from '@/contracts/coaching/progression';
import { planText } from '@/contracts/mcp/shape';
import { kvStorage } from '@/db/kv';
import { autoApplyAfterSession, undoFix, type AutoApplied } from '@/features/progression/apply';
import { useProgressionReview } from '@/hooks/use-data';
import { useSettings } from '@/store/settings-store';

import { progressionHref } from './stalled-section';

const autoKey = (logId: number) => `progression.autoApplied.${logId}`;
/** Only a just-finished workout acts; an old summary is history. */
const FRESH_MS = 12 * 3_600_000;

/**
 * Workout summary (PROGRESSION.md §6): lifts that stalled in this session.
 * "Auto-apply small fixes" applies the coach's low-risk fix once per
 * workout and shows it here with Undo; "Ask first" links to the fix screen;
 * "Off" shows nothing. Suggestions from Ask / Claude / web are listed too.
 */
export function AfterSessionPlateaus({ logId, startedAt }: { logId: number; startedAt: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const autonomy = useSettings((s) => s.progressionAutonomy);
  const { data: review } = useProgressionReview();
  const [applied, setApplied] = useState<AutoApplied[]>([]);
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const ran = useRef(false);
  // Read the clock once at mount, not on every render.
  const [fresh] = useState(() => Date.now() - startedAt <= FRESH_MS);

  useEffect(() => {
    if (!review || ran.current || autonomy !== 'auto_safe' || !fresh) return;
    ran.current = true;
    void (async () => {
      // Once per workout: reopening the summary must not apply twice.
      if (await kvStorage.getItem(autoKey(logId))) return;
      await kvStorage.setItem(autoKey(logId), '1');
      const out = await autoApplyAfterSession(review, autonomy, startedAt);
      setApplied(out);
    })();
  }, [review, autonomy, logId, startedAt, fresh]);

  if (!review || autonomy === 'off' || !fresh) return null;
  const shown = new Set(applied.map((a) => a.finding.exerciseKey));
  const stalled = review.findings.filter((f) => f.lastAt >= startedAt && f.status === 'open' && !shown.has(f.exerciseKey));
  const waiting = review.inbox;
  if (!applied.length && !stalled.length && !waiting.length) return null;

  const onUndo = async (a: AutoApplied) => {
    const r = await undoFix(a.decisionUuid);
    if (r === 'reverted') {
      setUndone((s) => new Set(s).add(a.decisionUuid));
      toast({ title: 'Undone', description: `${a.finding.name} is back as it was.`, variant: 'success' });
    }
  };

  return (
    <View>
      {applied.length ? (
        <Section title="Changed for you">
          <Card className="gap-3">
            {applied.map((a, i) => (
              <View key={a.decisionUuid} className="gap-2">
                {i > 0 ? <Separator /> : null}
                <ListRow
                  title={a.finding.name}
                  subtitle={`${planText(a.finding.fix.plan, review.unit) ?? REMEDY_LABEL[a.finding.fix.plan.remedy]} · ${a.finding.sessions} sessions stuck`}
                  onPress={() => router.push(progressionHref(a.finding.exerciseKey))}>
                  {undone.has(a.decisionUuid) ? (
                    <Caption>Undone</Caption>
                  ) : (
                    <Button size="sm" variant="outline" onPress={() => void onUndo(a)}>
                      Undo
                    </Button>
                  )}
                </ListRow>
              </View>
            ))}
            <Caption>Small fixes apply on their own (Settings → Coaching). Bigger ones still ask.</Caption>
          </Card>
        </Section>
      ) : null}

      {stalled.length || waiting.length ? (
        <Section title="Plateaus">
          <Card className="py-1">
            {stalled.map((f, i) => (
              <View key={f.exerciseKey}>
                {i > 0 ? <Separator /> : null}
                <ListRow
                  title={f.name}
                  subtitle={`${f.sessions} sessions stuck · try: ${REMEDY_LABEL[f.fix.plan.remedy].toLowerCase()}`}
                  onPress={() => router.push(progressionHref(f.exerciseKey))}
                />
              </View>
            ))}
            {waiting.map((d, i) => (
              <View key={d.id}>
                {i > 0 || stalled.length ? <Separator /> : null}
                <ListRow
                  title={d.exerciseName || 'Suggested change'}
                  subtitle={`From ${decisionSourceLabel(d.source)} · ${planText(d.params, review.unit) ?? REMEDY_LABEL[d.remedy]}`}
                  onPress={() => router.push(progressionHref(d.exerciseKey))}
                />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}
    </View>
  );
}
