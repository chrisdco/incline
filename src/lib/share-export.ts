import type { RefObject } from 'react';
import type { ViewInstance } from 'react-native';
import { Linking, Share } from 'react-native';
import type { ToastOptions } from '@/components/ui/toast';
import { withAppLink } from '@/lib/app-link';
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
  ref: RefObject<ViewInstance | null>,
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
  const message = withAppLink(opts.message);
  // Image plus caption (and app link) in one share, where the target app takes both.
  if (opts.uri && (await shareImageWithCaption(opts.uri, opts.title, message))) return 'file';
  const canShareFile = await Sharing.isAvailableAsync();
  if (canShareFile && opts.uri) {
    await Sharing.shareAsync(opts.uri, {
      mimeType: 'image/png',
      dialogTitle: opts.title,
    });
    return 'file';
  }
  await Share.share({ message, title: opts.title });
  return 'message';
}

type RNShare = typeof import('react-native-share').default;

/** True when the native sheet opened; false when the module is absent (older build) or failed. */
async function shareImageWithCaption(uri: string, title: string, message: string): Promise<boolean> {
  let lib: RNShare;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: the native module may be absent
    lib = (require('react-native-share') as { default: RNShare }).default;
  } catch {
    return false;
  }
  try {
    await lib.open({
      url: uri.startsWith('file://') ? uri : `file://${uri}`,
      type: 'image/png',
      message,
      title,
      failOnCancel: false,
    });
    return true;
  } catch {
    return false;
  }
}

/** Copy the captured PNG so the OS share sheet can Save Image / Files. */
export async function saveSharePng(uri: string, filename: string): Promise<string> {
  // Unique name: copying onto an earlier save fails on some platforms.
  const dest = `${cacheDirectory ?? ''}${Date.now()}-${filename}`;
  await copyAsync({ from: uri, to: dest });
  return dest;
}

type MediaLibrary = typeof import('expo-media-library');

/** Lazy: a build without the native module falls back to the share sheet. */
function mediaLibrary(): MediaLibrary | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: the native module may be absent
    return require('expo-media-library') as MediaLibrary;
  } catch {
    return null;
  }
}

/**
 * Saves straight to the photo library. Write-only access: no read prompt,
 * and Android 10+ needs no permission at all. Null when unavailable or denied.
 */
export async function savePngToPhotos(uri: string): Promise<'photos' | 'denied' | null> {
  const ml = mediaLibrary();
  if (!ml) return null;
  try {
    const perm = await ml.requestPermissionsAsync(true);
    if (!perm.granted) return 'denied';
    await ml.Asset.create(uri);
    return 'photos';
  } catch {
    return null;
  }
}

/**
 * Download = save to Photos. Falls back to the share sheet (Save image /
 * Files) when the library is unavailable, then to a text share.
 */
export async function downloadSharePng(opts: {
  uri: string | null;
  filename: string;
  title: string;
  message: string;
}): Promise<'photos' | 'denied' | 'saved' | 'message'> {
  if (opts.uri) {
    const photos = await savePngToPhotos(opts.uri);
    if (photos) return photos;
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
  await Share.share({ message: withAppLink(opts.message), title: opts.title });
  return 'message';
}

/** The toast after Download; the share-sheet fallbacks need none. */
export function announceSave(
  toast: (t: ToastOptions) => void,
  result: Awaited<ReturnType<typeof downloadSharePng>>,
): void {
  if (result === 'photos') toast({ title: 'Saved to Photos', variant: 'success' });
  if (result === 'denied') {
    toast({
      title: 'Photos access is off',
      description: 'Allow it in Settings to save cards directly.',
      variant: 'warning',
      action: { label: 'Settings', onPress: () => void Linking.openSettings() },
    });
  }
}
