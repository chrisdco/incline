import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/**
 * Old route name, kept so existing links (session plate shortcut,
 * `?tab=plates`) still land. The screen is `calculators` (#207).
 */
export default function CalculatorRedirect() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return <Redirect href={{ pathname: '/(app)/calculators', params: tab ? { tab } : {} } as Href} />;
}
