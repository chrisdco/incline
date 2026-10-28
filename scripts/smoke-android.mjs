#!/usr/bin/env node
/**
 * Launch smoke test for a release APK: install, open, and fail if the app
 * dies within the first seconds. Catches crash-on-launch before an APK is
 * shared (alpha 1 died inside ClerkProvider on a placeholder key).
 *
 *   pnpm run smoke:android -- <path-or-url.apk> [--serial emulator-5580] [--wait 20]
 *
 * Use the dedicated `incline_pixel` AVD (or a USB phone). The adb server is
 * shared with other projects: this script never restarts it and always
 * targets one device with -s.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PKG = 'com.chrisdc777.incline';
const args = process.argv.slice(2).filter((a) => a !== '--');
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : fallback;
};
const serial = opt('serial', 'emulator-5580');
const waitSec = Number(opt('wait', '20'));
let apk = args[0];
if (!apk) {
  console.error('usage: smoke-android <apk path or url> [--serial s] [--wait n]');
  process.exit(2);
}

const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const adbBin = sdk ? join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb';
const adb = (cmd, timeout = 30_000) =>
  execFileSync(adbBin, ['-s', serial, ...cmd], { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });

if (/^https?:\/\//.test(apk)) {
  const file = join(mkdtempSync(join(tmpdir(), 'incline-apk-')), 'app.apk');
  console.log(`[smoke] downloading ${apk}`);
  const res = await fetch(apk);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  apk = file;
}
if (!existsSync(apk)) throw new Error(`no such apk: ${apk}`);

console.log(`[smoke] installing on ${serial}`);
const install = spawnSync(adbBin, ['-s', serial, 'install', '-r', apk], { encoding: 'utf8', timeout: 300_000 });
if (install.status !== 0 || !/Success/.test(install.stdout)) {
  console.error(install.stdout, install.stderr, install.error ?? '');
  throw new Error('install failed or timed out (is the device responsive?)');
}

adb(['logcat', '-c']);
adb(['shell', 'monkey', '-p', PKG, '-c', 'android.intent.category.LAUNCHER', '1']);
await new Promise((r) => setTimeout(r, waitSec * 1000));

const pid = spawnSync(adbBin, ['-s', serial, 'shell', 'pidof', PKG], { encoding: 'utf8', timeout: 10_000 }).stdout.trim();
const crash = adb(['logcat', '-d', '-b', 'crash']);
const appCrash = crash.split('\n').filter((l) => l.includes(PKG) || l.includes('AndroidRuntime')).join('\n');

if (!pid || /FATAL EXCEPTION/.test(appCrash)) {
  console.error('[smoke] FAIL: app is not running after launch');
  console.error(crash.split('\n').slice(0, 40).join('\n'));
  process.exit(1);
}
console.log(`[smoke] ok: running as pid ${pid} after ${waitSec}s`);
