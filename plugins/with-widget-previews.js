/**
 * Widget-picker previews for the Android home-screen widgets.
 *
 * Copies plugins/widget-previews/res/** (static RemoteViews layouts + shape
 * drawables) into the app's res/. The `android:previewLayout` attribute that
 * points at them is written by the expo-widgets patch from each widget's
 * `android.previewLayout` in app.json. Android 12+ renders these layouts
 * live in the picker, so the preview is crisp, themed and scales to the cell
 * size; older launchers fall back to the generic icon.
 *
 * Keep previews in sync with src/widgets/*.tsx (same anatomy, sample data).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

module.exports = function withWidgetPreviews(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      // eslint-disable-next-line no-undef -- CommonJS config plugin
      copyDir(path.join(__dirname, 'widget-previews/res'), res);
      return cfg;
    },
  ]);
};
