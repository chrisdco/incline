/**
 * Native fingerprint inputs (runtime version policy "fingerprint").
 * package.json scripts never reach the native app; counting them meant a
 * lint or test script edit forced a new APK. See WORK-QUEUE "Build 3".
 */
/** @type {import('expo/fingerprint').Config} */
const { SourceSkips } = require('expo/fingerprint');

module.exports = {
  sourceSkips: SourceSkips.PackageJsonScriptsAll,
};
