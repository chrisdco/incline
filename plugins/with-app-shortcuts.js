/**
 * Android launcher shortcuts (long-press the app icon).
 *
 * Static shortcuts: res/xml/shortcuts.xml + a meta-data entry on the main
 * activity. Each one opens an incline:/// deep link, so expo-router handles
 * it like any other link (signed-out users land on sign-in first).
 *
 * To add one: append to SHORTCUTS (id, labels, deep-link path, 24dp Material
 * glyph path). Android shows at most four or five; keep the most used first.
 *
 * Limits: static only (no "resume Push day" dynamic shortcuts; that needs
 * ShortcutManager from native code). iOS home-screen quick actions are not
 * covered here.
 */
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require('expo/config-plugins');

const ACCENT = '#0D9488';

const SHORTCUTS = [
  {
    id: 'start',
    short: 'Start workout',
    long: 'Start a workout',
    path: 'start',
    glyph: 'M8,5v14l11,-7z',
  },
  {
    id: 'ask',
    short: 'Ask',
    long: 'Ask your coach',
    path: 'ask',
    glyph: 'M20,2H4c-1.1,0 -2,0.9 -2,2v18l4,-4h14c1.1,0 2,-0.9 2,-2V4c0,-1.1 -0.9,-2 -2,-2z',
  },
  {
    id: 'progress',
    short: 'Progress',
    long: 'See your progress',
    path: 'progress',
    glyph: 'M16,6l2.29,2.29 -4.88,4.88 -4,-4L2,16.59 3.41,18l6,-6 4,4 6.3,-6.29L22,12V6z',
  },
  {
    id: 'bodyweight',
    short: 'Bodyweight',
    long: 'Log bodyweight',
    path: 'bodyweight',
    glyph: 'M19,13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  },
];

const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function iconXml(glyph) {
  return `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
  android:width="48dp" android:height="48dp"
  android:viewportWidth="48" android:viewportHeight="48">
  <path android:fillColor="${ACCENT}" android:pathData="M24,0A24,24 0,1 1,24 48A24,24 0,1 1,24 0z" />
  <group android:translateX="12" android:translateY="12">
    <path android:fillColor="#FFFFFF" android:pathData="${glyph}" />
  </group>
</vector>
`;
}

function shortcutsXml(pkg) {
  const items = SHORTCUTS.map(
    (s) => `  <shortcut
    android:shortcutId="${s.id}"
    android:enabled="true"
    android:icon="@drawable/shortcut_${s.id}"
    android:shortcutShortLabel="@string/shortcut_${s.id}_short"
    android:shortcutLongLabel="@string/shortcut_${s.id}_long">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="incline:///${s.path}"
      android:targetPackage="${pkg}"
      android:targetClass="${pkg}.MainActivity" />
  </shortcut>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${items}
</shortcuts>
`;
}

module.exports = function withAppShortcuts(config) {
  config = withStringsXml(config, (cfg) => {
    for (const s of SHORTCUTS) {
      cfg.modResults = AndroidConfig.Strings.setStringItem(
        [
          { $: { name: `shortcut_${s.id}_short`, translatable: 'false' }, _: escapeXml(s.short) },
          { $: { name: `shortcut_${s.id}_long`, translatable: 'false' }, _: escapeXml(s.long) },
        ],
        cfg.modResults,
      );
    }
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity['meta-data'] = (activity['meta-data'] ?? []).filter(
      (m) => m.$['android:name'] !== 'android.app.shortcuts',
    );
    activity['meta-data'].push({
      $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' },
    });
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pkg = cfg.android?.package;
      if (!pkg) throw new Error('with-app-shortcuts: android.package is required');
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      fs.mkdirSync(path.join(res, 'xml'), { recursive: true });
      fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
      fs.writeFileSync(path.join(res, 'xml/shortcuts.xml'), shortcutsXml(pkg));
      for (const s of SHORTCUTS) {
        fs.writeFileSync(path.join(res, `drawable/shortcut_${s.id}.xml`), iconXml(s.glyph));
      }
      return cfg;
    },
  ]);
};
