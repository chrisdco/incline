/**
 * Widget refresh — non-Android platforms.
 *
 * The widgets are Android-only: their layouts use `@expo/ui/jetpack-compose`
 * and `expo-widgets`' Android runtime. Metro resolves `refresh.android.ts`
 * there; everywhere else this is a no-op so neither the widget modules nor the
 * Jetpack Compose UI land in the iOS/web bundles.
 */
export async function refreshWidgets(_now?: number): Promise<void> {}
