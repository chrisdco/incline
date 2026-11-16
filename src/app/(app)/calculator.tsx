import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

/**
 * Old route name, kept so existing links (session plate shortcut,
 * `?tab=plates`) still land. The screen is `calculators` (#207).
 */
export default function CalculatorRedirect() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const href: string = tab ? `/calculators?tab=${encodeURIComponent(tab)}` : '/calculators';
  return <Redirect href={href as Href} />;
}
