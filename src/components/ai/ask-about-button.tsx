import { useRouter } from 'expo-router';

import { Icon } from '@/components/common/icon';
import { Button } from '@/components/ui/button';
import { askAboutHref } from '@/ai/ask-about';
import type { ContextPart } from '@/contracts/ai/chat';
import { useSettings } from '@/store/settings-store';

import { AiMark } from './ai-mark';

/**
 * "Ask about this" (ASK-UI.md Phase 2): opens a new Ask thread with this
 * screen's subject attached. Hidden while AI is off, so it never leads to a
 * dead end. Tonal, never the screen's primary action.
 */
export function AskAboutButton({ about, label = 'Ask about this', className }: { about: Omit<ContextPart, 'type'>; label?: string; className?: string }) {
  const router = useRouter();
  const on = useSettings((s) => s.aiExplanationsEnabled);
  if (!on) return null;
  return (
    <Button
      variant="tonal"
      className={className}
      leftIcon={<Icon icon={AiMark} size={16} color="primary" />}
      onPress={() => router.push(askAboutHref({ type: 'context', ...about }))}
      accessibilityHint={`Opens Ask with ${about.label} attached`}>
      {label}
    </Button>
  );
}
