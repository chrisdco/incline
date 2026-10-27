/**
 * Release identity: which stage this binary belongs to and what it's running.
 *
 * The stage comes from the EAS Update channel baked into the build profile
 * (eas.json `channel`), so one binary can never report a stage it isn't
 * receiving updates for. `EXPO_PUBLIC_RELEASE_STAGE` covers builds without
 * updates configured; a dev server is always `development`.
 */
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';

export type ReleaseStage = 'development' | 'alpha' | 'beta' | 'production';

const STAGES: readonly ReleaseStage[] = ['development', 'alpha', 'beta', 'production'];

export const STAGE_LABELS: Record<ReleaseStage, string> = {
  development: 'Dev',
  alpha: 'Alpha',
  beta: 'Beta',
  production: 'Release',
};

function asStage(value: string | null | undefined): ReleaseStage | null {
  return value && (STAGES as readonly string[]).includes(value) ? (value as ReleaseStage) : null;
}

export function releaseStage(): ReleaseStage {
  if (__DEV__) return 'development';
  return asStage(Updates.channel) ?? asStage(process.env.EXPO_PUBLIC_RELEASE_STAGE) ?? 'production';
}

export interface ReleaseInfo {
  stage: ReleaseStage;
  /** Marketing version, e.g. "1.0.0". */
  version: string;
  /** Store build number (versionCode / CFBundleVersion). */
  build: string | null;
  /** Running OTA update (short id), null when on the embedded bundle. */
  updateId: string | null;
  updateCreatedAt: Date | null;
  runtimeVersion: string | null;
  channel: string | null;
}

export function releaseInfo(): ReleaseInfo {
  return {
    stage: releaseStage(),
    version: Application.nativeApplicationVersion ?? '0.0.0',
    build: Application.nativeBuildVersion ?? null,
    updateId: Updates.isEmbeddedLaunch ? null : (Updates.updateId?.slice(0, 8) ?? null),
    updateCreatedAt: Updates.isEmbeddedLaunch ? null : Updates.createdAt,
    runtimeVersion: Updates.runtimeVersion,
    channel: Updates.channel,
  };
}

/** "1.0.0 (12) · Alpha · a1b2c3d4" — for Settings, bug reports and Sentry tags. */
export function formatRelease(info: ReleaseInfo = releaseInfo()): string {
  const parts = [info.build ? `${info.version} (${info.build})` : info.version, STAGE_LABELS[info.stage]];
  if (info.updateId) parts.push(info.updateId);
  return parts.join(' · ');
}
