import type { RefObject } from 'react';
import { Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy';

export {
  SHARE_BACKGROUNDS,
  nextShareBackgroundId,
  shareBackgroundById,
  shareHandleFromName,
  type ShareBackgroundId,
} from '@/lib/share-chrome';

export async function captureSharePng(
  ref: RefObject<unknown>,
): Promise<string | null> {
  if (!ref.current) return null;
  try {
    return await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  } catch {
    return null;
  }
}

export async function sharePngOrMessage(opts: {
  uri: string | null;
  title: string;
  message: string;
}): Promise<'file' | 'message'> {
  const canShareFile = await Sharing.isAvailableAsync();
  if (canShareFile && opts.uri) {
    await Sharing.shareAsync(opts.uri, {
      mimeType: 'image/png',
      dialogTitle: opts.title,
    });
    return 'file';
  }
  await Share.share({ message: opts.message, title: opts.title });
  return 'message';
}

/** Copy the captured PNG so the OS share sheet can Save Image / Files. */
export async function saveSharePng(uri: string, filename: string): Promise<string> {
  const dest = `${cacheDirectory ?? ''}${filename}`;
  await copyAsync({ from: uri, to: dest });
  return dest;
}

export async function downloadSharePng(opts: {
  uri: string | null;
  filename: string;
  title: string;
  message: string;
}): Promise<'saved' | 'message'> {
  if (opts.uri) {
    const dest = await saveSharePng(opts.uri, opts.filename);
    const canShareFile = await Sharing.isAvailableAsync();
    if (canShareFile) {
      await Sharing.shareAsync(dest, {
        mimeType: 'image/png',
        dialogTitle: opts.title,
      });
      return 'saved';
    }
  }
  await Share.share({ message: opts.message, title: opts.title });
  return 'message';
}
