// Sentry's wrapper = Expo defaults + debug IDs so release stack traces map to source.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

const config = getSentryExpoConfig(__dirname);

// Support .wasm imports used by expo-sqlite on web
config.resolver.assetExts.push('wasm');

module.exports = withNativeWind(config, { input: './src/global.css' });
