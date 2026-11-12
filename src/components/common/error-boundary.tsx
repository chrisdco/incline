import { Component, Fragment, type ReactNode } from 'react';
import { View } from 'react-native';

import { Body, Caption, Heading } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { queryClient } from '@/lib/query-client';
import { reportError } from '@/lib/monitoring';
import { shouldReport } from '@/lib/error-dedupe';

/** A retry that fails again this soon counts as "still broken". */
const REPEAT_WINDOW_MS = 5_000;

interface Props {
  children: ReactNode;
  /** The single local reset path; injected so this file stays light. */
  onResetLocalData?: () => Promise<void>;
  /** After a reset remounts the tree (e.g. route back through the gate). */
  onAfterReset?: () => void;
}

interface State {
  error: unknown;
  /** Bumped on every recovery: keys the subtree so it truly remounts. */
  generation: number;
  retriedAt: number;
  /** Failed again right after a retry — lead with the reset option. */
  repeated: boolean;
  confirmReset: boolean;
  resetting: boolean;
  resetFailed: boolean;
}

/**
 * Calm recovery screen (#191). Never shows the raw error text in release
 * builds. "Try again" clears the in-memory query cache and remounts the
 * subtree (a fresh key), so a stale cached value can't rethrow on the same
 * render; nothing retries automatically, so it can't loop. "Reset local
 * data" runs the one reset path, then remounts — cloud data comes back on
 * the next sync.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    generation: 0,
    retriedAt: 0,
    repeated: false,
    confirmReset: false,
    resetting: false,
    resetFailed: false,
  };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error ?? new Error('Unknown render error') };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    if (Date.now() - this.state.retriedAt < REPEAT_WINDOW_MS) {
      this.setState({ repeated: true });
    }
    console.warn('[error-boundary]', error);
    if (shouldReport(error)) {
      reportError(error, { boundary: true, componentStack: info.componentStack ?? '' });
    }
  }

  private remount() {
    queryClient.clear();
    this.setState((s) => ({
      error: null,
      generation: s.generation + 1,
      retriedAt: Date.now(),
      confirmReset: false,
      resetting: false,
      resetFailed: false,
    }));
  }

  tryAgain = () => {
    this.remount();
  };

  resetLocalData = async () => {
    const reset = this.props.onResetLocalData;
    if (!reset) return;
    this.setState({ resetting: true, resetFailed: false });
    try {
      await reset();
    } catch (err) {
      console.warn('[error-boundary] reset failed', err);
      this.setState({ resetting: false, resetFailed: true });
      return;
    }
    this.setState({ repeated: false });
    this.afterReset = true;
    this.remount();
  };

  private afterReset = false;

  componentDidUpdate() {
    if (this.afterReset && this.state.error == null) {
      this.afterReset = false;
      this.props.onAfterReset?.();
    }
  }

  render() {
    const { error, generation, repeated, confirmReset, resetting, resetFailed } = this.state;
    if (error == null) {
      return <Fragment key={generation}>{this.props.children}</Fragment>;
    }
    const canReset = this.props.onResetLocalData != null;
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Heading className="text-center">
          {repeated ? 'Still not working' : 'Something went wrong'}
        </Heading>
        <Body className="mt-2 text-center text-muted-foreground">
          {repeated && canReset
            ? 'This screen keeps failing. Resetting this phone’s copy usually fixes it — your backed-up workouts come back after.'
            : 'This screen hit a problem. Your workouts are saved on this phone.'}
        </Body>
        {__DEV__ && error instanceof Error ? (
          <Caption className="mt-3 text-center">{error.message}</Caption>
        ) : null}
        {resetFailed ? (
          <Caption className="mt-3 text-center text-destructive">Reset didn’t finish. Nothing was removed.</Caption>
        ) : null}
        <View className="mt-6 w-full max-w-xs gap-3">
          <Button onPress={this.tryAgain} variant={repeated && canReset ? 'outline' : 'default'}>
            Try again
          </Button>
          {canReset ? (
            <Button
              variant={repeated ? 'destructive' : 'ghost'}
              onPress={() => this.setState({ confirmReset: true })}>
              Reset local data
            </Button>
          ) : null}
        </View>
        <Dialog
          open={confirmReset}
          onOpenChange={(open) => { if (!resetting) this.setState({ confirmReset: open }); }}
          title="Reset this phone’s data?"
          description="Removes workouts, photos and settings stored on this phone, including changes that haven’t synced yet. Anything backed up returns on the next sync. You stay signed in."
          footer={
            <>
              <Button variant="outline" disabled={resetting} onPress={() => this.setState({ confirmReset: false })}>
                Cancel
              </Button>
              <Button variant="destructive" loading={resetting} disabled={resetting} onPress={() => void this.resetLocalData()}>
                Reset
              </Button>
            </>
          }
        />
      </View>
    );
  }
}
