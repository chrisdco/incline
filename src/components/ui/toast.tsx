import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react-native';

import { Text } from './text';
import { Icon } from '@/components/common/icon';
import { useSettings } from '@/store/settings-store';

type ToastVariant = 'default' | 'success' | 'warning' | 'destructive' | 'info';

interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Optional right-side action (e.g. Undo). Extends visibility while shown. */
  action?: ToastAction;
  /** Override auto-dismiss ms. `null` = sticky until tapped. */
  durationMs?: number | null;
  /** Haptic on show. Defaults: success plays, destructive never. */
  haptic?: boolean;
}

interface ToastItem extends Required<Pick<ToastOptions, 'title' | 'variant'>> {
  id: number;
  description?: string;
  action?: ToastAction;
  durationMs: number | null;
}

interface ToastContextValue {
  toast: (t: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const DEFAULT_DURATION: Record<ToastVariant, number | null> = {
  default: 2500,
  info: 2500,
  success: 3000,
  warning: 4000,
  // Destructive carries the fix; it stays until tapped.
  destructive: null,
};

const variantIcon = {
  default: null,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
  info: Info,
} as const;

const variantIconColor = {
  default: 'muted-foreground',
  success: 'success',
  warning: 'warning',
  destructive: 'destructive',
  info: 'info',
} as const;

/**
 * Bottom snackbar (Hevy-style placement: thumb zone, never covering the
 * header). One visible at a time, short queue behind it; tap dismisses.
 * Success/info confirm briefly, warnings linger, destructive sticks around
 * with the fix until tapped. Announced to screen readers on show.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Swallows the outer dismiss when the action press bubbles through it —
  // nested Pressables both fire, and the second dismiss would eat the queue.
  const actionFiredRef = useRef(false);
  const insets = useSafeAreaInsets();
  const current = queue[0] ?? null;

  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setQueue((prev) => prev.slice(1));
  }, []);

  const toast = useCallback<ToastContextValue['toast']>((t) => {
    const id = ++idRef.current;
    const variant = t.variant ?? 'default';
    const hapticsOn = useSettings.getState().hapticsEnabled;
    const wantHaptic = t.haptic ?? variant === 'success';
    if (wantHaptic && hapticsOn) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setQueue((prev) => {
      // Latest wins; keep at most two waiting so a burst can't stack screens.
      const next = [...prev, {
        id,
        title: t.title,
        description: t.description,
        variant,
        action: t.action,
        durationMs: t.durationMs !== undefined ? t.durationMs : DEFAULT_DURATION[variant],
      }];
      return next.slice(-3);
    });
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (current && current.durationMs != null) {
      timerRef.current = setTimeout(dismiss, current.durationMs);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [current, dismiss]);

  const IconGlyph = current ? variantIcon[current.variant] : null;

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <View pointerEvents="box-none" className="absolute inset-0 z-50 justify-end" style={{ bottom: insets.bottom + 88 }}>
        {current ? (
          <View className="items-center px-6">
            <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(160)}>
              <Pressable
                onPress={() => {
                  if (actionFiredRef.current) {
                    actionFiredRef.current = false;
                    return;
                  }
                  dismiss();
                }}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                accessibilityLabel={`${current.title}${current.description ? `. ${current.description}` : ''}. Tap to dismiss.`}
                className="flex-row items-center gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg">
                {IconGlyph ? <Icon icon={IconGlyph} size={18} color={variantIconColor[current.variant]} /> : null}
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-foreground">{current.title}</Text>
                  {current.description ? <Text className="mt-0.5 text-xs text-muted-foreground">{current.description}</Text> : null}
                </View>
                {current.action ? (
                  <Pressable
                    onPress={() => {
                      actionFiredRef.current = true;
                      current.action?.onPress();
                      dismiss();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={current.action.label}
                    hitSlop={8}
                    className="rounded-lg bg-primary/15 px-3 py-1.5">
                    <Text className="text-xs font-semibold text-primary">{current.action.label}</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            </Animated.View>
          </View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}
