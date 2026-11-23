// The phone app (Capacitor, android/): what Telegram does for the Mini App, the phone does here.
// tg/telegram.ts asks this file whenever it runs outside Telegram inside the app. In a browser and in
// Telegram `isNative` is false and nothing here is called.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { SplashScreen } from '@capacitor/splash-screen';

export const isNative: boolean = Capacitor.isNativePlatform();
export const nativePlatform: string = Capacitor.getPlatform();

if (isNative && typeof document !== 'undefined') document.documentElement.classList.add('native');

/**
 * The newest Android build (android/app/build.gradle versionCode) on GitHub Releases. The app itself
 * is loaded from the site, so most changes need no new APK; a change to the Android side does, and
 * raising this tells the phones that have an older one.
 */
export const LATEST_ANDROID_BUILD = 2;
export const SITE_URL = 'https://lifepath.khurshidbekdev.workers.dev';
/** The newest APK, served by the site itself (npm run android:apk puts it in public/). */
export const APK_URL = `${SITE_URL}/LifePath.apk`;
/** The bot, which opens the Mini App. */
export const BOT_URL = 'https://t.me/LifePathAppBot';

/** This phone's Android build number, or 0 outside the app (or before it is known). */
export async function androidBuild(): Promise<number> {
  if (!isNative) return 0;
  try {
    return Number((await App.getInfo()).build) || 0;
  } catch {
    return 0;
  }
}

// The offline copy (public/sw.js): only in the phone app, which is loaded from the site.
if (isNative && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && location.protocol === 'https:' && !/^localhost$/.test(location.hostname)) {
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

// ---------- start, back button ----------

/** Once at start: the hardware back button steps back through the app, and leaves it at the root. */
export function bootNative(back: () => boolean): void {
  void App.addListener('backButton', () => {
    if (!back()) void App.minimizeApp();
  });
}

/** The first screen is drawn: the splash can go. */
export function hideSplash(): void {
  if (isNative) void SplashScreen.hide({ fadeOutDuration: 220 });
}

// ---------- haptics ----------

export function nativeHaptic(kind: string): void {
  const run =
    kind === 'select' ? Haptics.selectionChanged()
    : kind === 'success' ? Haptics.notification({ type: NotificationType.Success })
    : kind === 'warning' ? Haptics.notification({ type: NotificationType.Warning })
    : kind === 'error' ? Haptics.notification({ type: NotificationType.Error })
    : Haptics.impact({ style: kind === 'heavy' || kind === 'rigid' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
  run.catch(() => undefined);
}

// ---------- status and navigation bars ----------

/** Dark icons on a light background, light icons on a dark one. The app draws behind both bars. */
export function paintBars(bg: string): void {
  const hex = bg.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const light = 0.299 * r + 0.587 * g + 0.114 * b > 150;
  const SystemBars = (Capacitor as any).Plugins?.SystemBars;
  // LIGHT means light content (for a dark background) in Capacitor's naming.
  SystemBars?.setStyle?.({ style: light ? 'LIGHT' : 'DARK' })?.catch?.(() => undefined);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', bg);
}

// ---------- links and sharing ----------

export function nativeOpenLink(url: string): void {
  // t.me links open Telegram itself when it is installed; the rest open in an in-app browser tab.
  if (/^(https?:\/\/t\.me\/|tg:)/i.test(url)) {
    window.open(url, '_system');
    return;
  }
  Browser.open({ url }).catch(() => window.open(url, '_system'));
}

export function nativeShareText(text: string, url?: string): void {
  Share.share({ text, url }).catch(() => undefined);
}

const toBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * Hands a file to the phone's share sheet. The file is written to the app's cache first, which only
 * this app can read, and the share sheet gets a link to it.
 */
export async function nativeShareFile(blob: Blob, name: string, title?: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    const written = await Filesystem.writeFile({ path: name, data: await toBase64(blob), directory: Directory.Cache });
    await Share.share({ files: [written.uri], title });
    return 'shared';
  } catch (e) {
    return /cancel/i.test(String((e as Error)?.message ?? e)) ? 'cancelled' : 'failed';
  }
}

// ---------- location ----------

export async function nativeLocation(): Promise<{ lat: number; lon: number } | 'denied' | 'unavailable'> {
  try {
    let perm = await Geolocation.checkPermissions();
    if (perm.coarseLocation !== 'granted' && perm.location !== 'granted') perm = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
    if (perm.coarseLocation !== 'granted' && perm.location !== 'granted') return 'denied';
    // The network's guess first (quick, and the city is enough); the GPS when the phone has no such guess.
    const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 })
      .catch(() => Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 10 * 60_000 }));
    return { lat: p.coords.latitude, lon: p.coords.longitude };
  } catch (e) {
    return /denied|permission/i.test(String((e as Error)?.message ?? e)) ? 'denied' : 'unavailable';
  }
}

// ---------- notifications ----------

/** Asks to show notifications (Android 13 and later ask the user). True when allowed. */
export async function askNotifications(): Promise<boolean> {
  try {
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
    return perm.display === 'granted';
  } catch {
    return false;
  }
}

/** 'prompt' when the phone has never asked about notifications yet. */
export async function notificationPermission(): Promise<string> {
  try {
    return (await LocalNotifications.checkPermissions()).display;
  } catch {
    return 'denied';
  }
}

export async function notificationsAllowed(): Promise<boolean> {
  try {
    return (await LocalNotifications.checkPermissions()).display === 'granted';
  } catch {
    return false;
  }
}

/** A tapped notification opens the part of the app it is about (the same words the bot's buttons use). */
export function onNotificationTap(open: (param: string) => void): void {
  void LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const param = a.notification.extra?.open;
    if (typeof param === 'string' && param) open(param);
  });
}
