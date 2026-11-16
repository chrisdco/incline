/**
 * Where a shared card points people to get Incline. Set per build
 * (EXPO_PUBLIC_APP_SHARE_URL: store listing or landing page); unset = no link.
 */
export const APP_SHARE_URL = process.env.EXPO_PUBLIC_APP_SHARE_URL?.trim() ?? '';

/** Appends the download link as its own line, once. */
export function withAppLink(message: string, url = APP_SHARE_URL): string {
  if (!url || message.includes(url)) return message;
  return `${message}\n${url}`;
}
