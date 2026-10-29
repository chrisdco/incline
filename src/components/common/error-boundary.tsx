import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { Heading, Caption } from '@/components/common/text';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/monitoring';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportError(error, { boundary: true, componentStack: info.componentStack ?? '' });
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View className="flex-1 items-center justify-center bg-background px-6">
          <Heading>Something went wrong</Heading>
          <Caption className="mt-2 text-center">{this.state.error?.message ?? 'An unexpected error occurred.'}</Caption>
          <Button className="mt-6" onPress={this.reset}>Try again</Button>
        </View>
      );
    }
    return this.props.children;
  }
}
