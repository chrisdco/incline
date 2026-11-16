import { Platform } from 'react-native';

import { createHealthConnectPort } from './health-connect';
import { UNAVAILABLE_HEALTH, type HealthPort } from './types';

export * from './types';

let port: HealthPort | null = null;

/** The platform's health port: Health Connect on Android; nothing elsewhere until HealthKit (HEALTH.md). */
export function getHealthPort(): HealthPort {
  port ??= Platform.OS === 'android' ? createHealthConnectPort() : UNAVAILABLE_HEALTH;
  return port;
}
