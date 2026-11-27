import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

/**
 * Copy text, then confirm. Android 13+ shows its own clipboard preview, and
 * Android's guidance is not to stack an app toast on top of it, so `confirm`
 * runs only where the system stays silent.
 */
export async function copyText(text: string, confirm: () => void): Promise<void> {
  await Clipboard.setStringAsync(text);
  const systemConfirms = Platform.OS === 'android' && Number(Platform.Version) >= 33;
  if (!systemConfirms) confirm();
}
