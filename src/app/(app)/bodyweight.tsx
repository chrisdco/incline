import { Redirect, type Href } from 'expo-router';

/** Old route name, kept so existing links still land. The screen is `measurements` (#207). */
export default function BodyweightRedirect() {
  return <Redirect href={'/(app)/measurements' as Href} />;
}
