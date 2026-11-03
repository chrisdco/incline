import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ChevronLeft, ChevronRight, RefreshCw, ThumbsDown } from 'lucide-react-native';

import { Chip } from '@/components/common/chip';
import { Icon } from '@/components/common/icon';
import { Body, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Tappable } from '@/components/ui/tappable';

import { SourceChip, SuggestedBadge } from './markers';

/** Reason chips behind 👎 — they feed preferences (AI-ARCHITECTURE §1b). */
export const REJECT_REASONS = [
  { id: 'too_long', label: 'Too long' },
  { id: 'too_easy', label: 'Too easy' },
  { id: 'too_hard', label: 'Too hard' },
  { id: 'wrong_equipment', label: 'Wrong equipment' },
  { id: 'not_for_me', label: 'Not for me' },
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number]['id'];

export interface ProposalVersions {
  /** 0-based index of the version shown. */
  index: number;
  total: number;
  onChange: (index: number) => void;
}

/**
 * A suggestion the user can act on: Suggest → Preview → Apply → Undo. The
 * dashed outline means nothing has changed yet. The surface renders the diff
 * preview as `children`; this card owns the actions and feedback so every AI
 * proposal behaves the same. Apply goes through `applyAiChange` upstream.
 */
export function ProposalCard({
  title,
  basis,
  onBasisPress,
  children,
  versions,
  applyLabel = 'Apply',
  applying,
  onApply,
  onEdit,
  onRegenerate,
  onReject,
}: {
  title: string;
  /** "Based on your last 6 bench sessions". */
  basis?: string;
  onBasisPress?: () => void;
  children?: ReactNode;
  versions?: ProposalVersions;
  applyLabel?: string;
  applying?: boolean;
  onApply: () => void;
  /** Opens the normal editor prefilled with this proposal. */
  onEdit?: () => void;
  onRegenerate?: () => void;
  onReject?: (reason: RejectReason | null) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const busy = Boolean(applying);

  return (
    <View className="gap-3 rounded-3xl border border-dashed border-primary/50 bg-surface1 p-4">
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 gap-1.5">
          <SuggestedBadge className="self-start" />
          <Body className="font-semibold text-foreground">{title}</Body>
          {basis ? <SourceChip label={basis} onPress={onBasisPress} /> : null}
        </View>
        {versions && versions.total > 1 ? (
          <View className="flex-row items-center gap-1">
            <Tappable
              onPress={() => versions.onChange(versions.index - 1)}
              disabled={versions.index === 0}
              pressedOpacity={0.55}
              accessibilityRole="button"
              accessibilityLabel="Previous version"
              hitSlop={8}
              className={versions.index === 0 ? 'opacity-40' : undefined}>
              <Icon icon={ChevronLeft} size={18} color="muted-foreground" />
            </Tappable>
            <Caption className="tabular-nums">
              v{versions.index + 1}/{versions.total}
            </Caption>
            <Tappable
              onPress={() => versions.onChange(versions.index + 1)}
              disabled={versions.index >= versions.total - 1}
              pressedOpacity={0.55}
              accessibilityRole="button"
              accessibilityLabel="Next version"
              hitSlop={8}
              className={versions.index >= versions.total - 1 ? 'opacity-40' : undefined}>
              <Icon icon={ChevronRight} size={18} color="muted-foreground" />
            </Tappable>
          </View>
        ) : null}
      </View>

      {children}

      <View className="flex-row gap-2">
        {onEdit ? (
          <Button variant="outline" size="sm" className="flex-1" onPress={onEdit} disabled={busy}>
            Edit
          </Button>
        ) : null}
        <Button size="sm" className="flex-1" onPress={onApply} loading={busy}>
          {applyLabel}
        </Button>
      </View>

      {onRegenerate || onReject ? (
        <View className="flex-row items-center justify-end gap-4">
          {onRegenerate ? (
            <Tappable
              onPress={onRegenerate}
              disabled={busy}
              pressedOpacity={0.55}
              accessibilityRole="button"
              className="flex-row items-center gap-1">
              <Icon icon={RefreshCw} size={14} color="muted-foreground" />
              <Caption>Try another</Caption>
            </Tappable>
          ) : null}
          {onReject ? (
            <Tappable
              onPress={() => setRejecting((r) => !r)}
              disabled={busy}
              pressedOpacity={0.55}
              accessibilityRole="button"
              accessibilityLabel="Not helpful"
              accessibilityState={{ expanded: rejecting }}
              hitSlop={8}>
              <Icon icon={ThumbsDown} size={14} color="muted-foreground" />
            </Tappable>
          ) : null}
        </View>
      ) : null}

      {rejecting && onReject ? (
        <View className="gap-2">
          <Caption>What was off?</Caption>
          <View className="flex-row flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => (
              <Chip key={r.id} size="sm" label={r.label} onPress={() => onReject(r.id)} />
            ))}
            <Chip size="sm" label="Just dismiss" onPress={() => onReject(null)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
