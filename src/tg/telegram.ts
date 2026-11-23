// Thin, typed wrapper around Telegram.WebApp. Everything degrades to a no-op in a normal browser,
// so the app can be developed and previewed outside Telegram.

declare global {
  interface Window {
    Telegram?: { WebApp: any };
  }
}

import {
  bootNative, isNative, nativeHaptic, nativeLocation, nativeOpenLink, nativePlatform, nativeShareText, paintBars, askNotifications,
} from '../native/bridge';

const wa: any = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

/** True only when the page was really opened by Telegram (it then carries signed init data). */
export const inTelegram: boolean = !!wa && typeof wa.initData === 'string' && wa.initData.length > 0;

const atLeast = (v: string): boolean => inTelegram && typeof wa.isVersionAtLeast === 'function' && wa.isVersionAtLeast(v);

export interface TgUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  lang?: string;
}

const rawUser = inTelegram ? wa.initDataUnsafe?.user : undefined;

export const tgUser: TgUser = rawUser
  ? {
      id: rawUser.id,
      firstName: rawUser.first_name ?? '',
      lastName: rawUser.last_name || undefined,
      username: rawUser.username || undefined,
      photoUrl: rawUser.photo_url || undefined,
      lang: rawUser.language_code || undefined,
    }
  : { id: 0, firstName: '', lang: typeof navigator !== 'undefined' ? navigator.language : 'en' };

export const initData: string = inTelegram ? wa.initData : '';
/** Telegram Premium: stories with a link need it. */
export const isPremium: boolean = rawUser?.is_premium === true;
export const platform: string = inTelegram ? String(wa.platform ?? 'unknown') : isNative ? `app-${nativePlatform}` : 'browser';
/** The phone app (Capacitor), not Telegram and not a browser tab. */
export { isNative };
/** An ordinary browser: neither Telegram nor the phone app. It signs in through the bot, as the phone app does. */
export const inBrowser: boolean = !inTelegram && !isNative;
/** An iPhone or iPad browser (iPadOS calls itself a Mac, but has a touch screen). */
export const onIOS: boolean =
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
/** Opened from the home screen (Safari "Add to Home Screen" or an installed web app). */
export const onHomeScreen: boolean =
  typeof window !== 'undefined' &&
  ((navigator as Navigator & { standalone?: boolean }).standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches);
export const isMobile: boolean = platform === 'ios' || platform === 'android' || platform === 'android_x';

/** Deep-link parameter: t.me/<bot>?startapp=<param>, or ?open=<param> on buttons the bot sends. */
export const startParam: string | undefined = (() => {
  const fromTg = inTelegram ? wa.initDataUnsafe?.start_param : undefined;
  if (fromTg) return String(fromTg);
  try {
    const q = new URLSearchParams(window.location.search);
    return q.get('open') ?? q.get('tgWebAppStartParam') ?? undefined;
  } catch {
    return undefined;
  }
})();

/** Telegram Android reports a device performance class in the user agent; LOW devices get fewer effects. */
export const lowPerf: boolean = (() => {
  if (typeof navigator === 'undefined') return false;
  if (/Telegram-Android\/[^)]*;\s*LOW\)/.test(navigator.userAgent)) return true;
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
})();

// ---------- Haptics ----------

export type Haptic = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid' | 'success' | 'warning' | 'error' | 'select';

let hapticsOn = true;
export const setHaptics = (on: boolean) => {
  hapticsOn = on;
};

export function haptic(kind: Haptic = 'light'): void {
  if (hapticsOn && isNative) return nativeHaptic(kind);
  if (!hapticsOn || !atLeast('6.1')) return;
  try {
    const h = wa.HapticFeedback;
    if (kind === 'select') h.selectionChanged();
    else if (kind === 'success' || kind === 'warning' || kind === 'error') h.notificationOccurred(kind);
    else h.impactOccurred(kind);
  } catch {
    // ignore: haptics are decoration
  }
}

// ---------- Window chrome, theme, safe areas ----------

export type Scheme = 'dark' | 'light';

export function telegramScheme(): Scheme {
  if (inTelegram) return wa.colorScheme === 'light' ? 'light' : 'dark';
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** Paints Telegram's own header, background and bottom bar in the app's colors. */
export function paintChrome(bg: string): void {
  if (isNative) return paintBars(bg);
  if (!inTelegram) return;
  try {
    if (atLeast('6.9')) wa.setHeaderColor(bg);
    else if (atLeast('6.1')) wa.setHeaderColor('bg_color');
    if (atLeast('6.1')) wa.setBackgroundColor(bg);
    if (atLeast('7.10')) wa.setBottomBarColor(bg);
  } catch {
    // older clients
  }
}

export const canFullscreen: boolean = atLeast('8.0') && isMobile;

export function setFullscreen(on: boolean): void {
  if (!canFullscreen) return;
  try {
    if (on && !wa.isFullscreen) wa.requestFullscreen();
    if (!on && wa.isFullscreen) wa.exitFullscreen();
  } catch {
    // unsupported on this client
  }
}

export function onTelegramEvent(event: string, handler: (payload?: any) => void): () => void {
  if (!inTelegram) return () => {};
  wa.onEvent(event, handler);
  return () => wa.offEvent(event, handler);
}

/** Call once at start: tells Telegram the app is ready and sets the window up. */
export function bootTelegram(): void {
  // The phone's back button: the same steps back as Telegram's (App.tsx sets them), else leave the app.
  if (isNative) return bootNative(() => (backHandler ? (backHandler(), true) : false));
  if (!inTelegram) return;
  try {
    wa.ready();
    wa.expand();
    if (atLeast('7.7')) wa.disableVerticalSwipes(); // sheets and lists own vertical drags
  } catch {
    // ignore
  }
}

// ---------- Back and settings buttons ----------

let backHandler: (() => void) | null = null;
const fireBack = () => backHandler?.();

export function setBackButton(handler: (() => void) | null): void {
  backHandler = handler;
  if (!atLeast('6.1')) return;
  try {
    wa.BackButton.offClick(fireBack);
    if (handler) {
      wa.BackButton.onClick(fireBack);
      wa.BackButton.show();
    } else {
      wa.BackButton.hide();
    }
  } catch {
    // ignore
  }
}

export function setSettingsButton(handler: () => void): void {
  if (!atLeast('7.0')) return;
  try {
    wa.SettingsButton.onClick(handler);
    wa.SettingsButton.show();
  } catch {
    // ignore
  }
}

// ---------- Links, sharing, home screen ----------

export function openLink(url: string): void {
  if (isNative) return nativeOpenLink(url);
  if (inTelegram) {
    try {
      if (/^https?:\/\/t\.me\//i.test(url)) wa.openTelegramLink(url);
      else wa.openLink(url);
      return;
    } catch {
      // fall through
    }
  }
  window.open(url, '_blank', 'noopener');
}

export function shareText(text: string, url: string): void {
  if (isNative) return nativeShareText(text, url);
  openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
}

/** Telegram Stories, from a Mini App: phones only, Bot API 7.8 and later. */
export const canStory: boolean = atLeast('7.8') && isMobile;

/**
 * Opens Telegram's story editor with the picture at `mediaUrl` (a public https address). The caption
 * may be 200 characters (2048 with Premium); the link under the story is a Premium feature.
 */
export function shareStory(mediaUrl: string, text: string, link?: { url: string; name: string }): boolean {
  if (!canStory) return false;
  try {
    wa.shareToStory(mediaUrl, { text: text.slice(0, 200), ...(link && isPremium ? { widget_link: link } : {}) });
    return true;
  } catch {
    return false;
  }
}

export const canAddToHome: boolean = atLeast('8.0') && isMobile;
export function addToHomeScreen(): void {
  if (!canAddToHome) return;
  try {
    wa.addToHomeScreen();
  } catch {
    // ignore
  }
}

export function hideKeyboard(): void {
  if (atLeast('9.1')) {
    try {
      wa.hideKeyboard();
      return;
    } catch {
      // fall through
    }
  }
  (document.activeElement as HTMLElement | null)?.blur?.();
}

// ---------- Bot permissions and payments ----------

/** Asks the user to let the bot message them (needed for reminders). Resolves true when allowed. */
export function requestWriteAccess(): Promise<boolean> {
  return new Promise((resolve) => {
    // In the phone app the reminders are the phone's own notifications: this asks to show them.
    if (isNative) return void askNotifications().then(resolve);
    if (!atLeast('6.9')) return resolve(inTelegram);
    try {
      wa.requestWriteAccess((allowed: boolean) => resolve(!!allowed));
    } catch {
      resolve(false);
    }
  });
}

export type InvoiceStatus = 'paid' | 'cancelled' | 'failed' | 'pending' | 'unsupported';

export function openInvoice(url: string): Promise<InvoiceStatus> {
  return new Promise((resolve) => {
    if (!atLeast('6.1')) return resolve('unsupported');
    try {
      wa.openInvoice(url, (status: InvoiceStatus) => resolve(status));
    } catch {
      resolve('failed');
    }
  });
}

// ---------- A face or fingerprint check (Bot API 7.2), for what should stay private ----------

export interface Biometrics {
  /** The phone can check a face or a finger, and this Telegram offers that to Mini Apps. */
  available: boolean;
  kind: 'face' | 'finger' | 'unknown';
  /** The user has let this bot ask for the check. */
  granted: boolean;
}

const NO_BIOMETRICS: Biometrics = { available: false, kind: 'unknown', granted: false };
// Development outside Telegram: a pretend check that always passes, so locked screens can be tried.
const pretendBiometrics = !!import.meta.env?.DEV && !inTelegram;

const biometricManager = (): any => (atLeast('7.2') ? wa.BiometricManager ?? null : null);

/** What this phone can do. Safe to ask again and again. */
export function biometrics(): Promise<Biometrics> {
  if (pretendBiometrics) return Promise.resolve({ available: true, kind: 'face', granted: true });
  const bm = biometricManager();
  if (!bm) return Promise.resolve(NO_BIOMETRICS);
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: Biometrics) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const read = () =>
      done({
        available: !!bm.isBiometricAvailable,
        kind: bm.biometricType === 'face' || bm.biometricType === 'finger' ? bm.biometricType : 'unknown',
        granted: !!bm.isAccessGranted,
      });
    setTimeout(() => done(NO_BIOMETRICS), 4000);
    try {
      if (bm.isInited) read();
      else bm.init(read);
    } catch {
      done(NO_BIOMETRICS);
    }
  });
}

/** Asks the user to let this bot use the check. `reason` is shown in Telegram's own question. */
export function allowBiometrics(reason: string): Promise<boolean> {
  if (pretendBiometrics) return Promise.resolve(true);
  const bm = biometricManager();
  if (!bm) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      bm.requestAccess({ reason: reason.slice(0, 128) }, (granted: boolean) => resolve(!!granted));
    } catch {
      resolve(false);
    }
  });
}

/** Runs the check. True when the face or finger was the owner's. */
export function checkBiometrics(reason: string): Promise<boolean> {
  if (pretendBiometrics) return new Promise((resolve) => setTimeout(() => resolve(true), 350));
  const bm = biometricManager();
  if (!bm) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      bm.authenticate({ reason: reason.slice(0, 128) }, (ok: boolean) => resolve(!!ok));
    } catch {
      resolve(false);
    }
  });
}

/** Telegram's page where the check can be allowed again after a "no". */
export function openBiometricSettings(): void {
  try {
    biometricManager()?.openSettings();
  } catch {
    // nothing to open
  }
}

// ---------- Cloud storage (per user, per bot; 1024 keys, 4096 characters per value) ----------

export const hasCloud: boolean = atLeast('6.9');
const CLOUD_TIMEOUT = 12000;

function cloudCall<T>(run: (cb: (err: unknown, result: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('cloud storage timed out'));
      }
    }, CLOUD_TIMEOUT);
    try {
      run((err, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(new Error(String(err)));
        else resolve(result);
      });
    } catch (e) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(e);
      }
    }
  });
}

export const cloud = {
  getItem: (key: string) => cloudCall<string>((cb) => wa.CloudStorage.getItem(key, cb)),
  getItems: (keys: string[]) => cloudCall<Record<string, string>>((cb) => wa.CloudStorage.getItems(keys, cb)),
  setItem: (key: string, value: string) => cloudCall<boolean>((cb) => wa.CloudStorage.setItem(key, value, cb)),
  removeItems: (keys: string[]) => cloudCall<boolean>((cb) => wa.CloudStorage.removeItems(keys, cb)),
  getKeys: () => cloudCall<string[]>((cb) => wa.CloudStorage.getKeys(cb)),
};

// ---------- Location and compass ----------

export type LocationResult = { lat: number; lon: number } | 'denied' | 'unavailable';

/** Where the phone is: Telegram's location manager (8.0+, it asks once for this bot), else the browser's. */
export function getLocation(): Promise<LocationResult> {
  if (isNative) return nativeLocation();
  return new Promise((resolve) => {
    const browser = () => {
      if (!navigator.geolocation) return resolve('unavailable');
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        (e) => resolve(e.code === 1 ? 'denied' : 'unavailable'),
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 },
      );
    };
    const lm = atLeast('8.0') ? wa.LocationManager : null;
    if (!lm) return browser();
    try {
      const ask = () => {
        if (!lm.isLocationAvailable) return browser();
        lm.getLocation((data: any) => {
          if (data && typeof data.latitude === 'number') resolve({ lat: data.latitude, lon: data.longitude });
          else resolve(lm.isAccessRequested && !lm.isAccessGranted ? 'denied' : 'unavailable');
        });
      };
      if (lm.isInited) ask();
      else lm.init(ask);
    } catch {
      browser();
    }
  });
}

/** After a "no", Telegram can open this bot's location permission; false where it cannot. */
export function openLocationSettings(): boolean {
  const lm = atLeast('8.0') ? wa.LocationManager : null;
  if (!lm?.isInited || !lm.isAccessRequested || lm.isAccessGranted) return false;
  try {
    lm.openSettings();
    return true;
  } catch {
    return false;
  }
}

/**
 * Calls `onHeading` with where the top of the phone points, in degrees clockwise from north, for as
 * long as the phone reports it. Telegram's own orientation API first (8.0+), then the browser's:
 * absolute orientation on Android, webkitCompassHeading on iOS. Returns the function that stops it.
 */
export function watchHeading(onHeading: (deg: number) => void): () => void {
  const norm = (d: number) => ((d % 360) + 360) % 360;
  const DO = atLeast('8.0') ? wa.DeviceOrientation : null;
  if (DO) {
    const handler = () => {
      if (DO.absolute && typeof DO.alpha === 'number') onHeading(norm(360 - (DO.alpha * 180) / Math.PI));
    };
    try {
      wa.onEvent('deviceOrientationChanged', handler);
      DO.start({ refresh_rate: 50, need_absolute: true });
      return () => {
        wa.offEvent('deviceOrientationChanged', handler);
        try {
          DO.stop();
        } catch {
          // already stopped
        }
      };
    } catch {
      wa.offEvent?.('deviceOrientationChanged', handler);
    }
  }
  const absolute = (e: DeviceOrientationEvent) => {
    if (e.absolute && typeof e.alpha === 'number') onHeading(norm(360 - e.alpha));
  };
  const ios = (e: DeviceOrientationEvent) => {
    const h = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    if (typeof h === 'number') onHeading(norm(h));
  };
  window.addEventListener('deviceorientationabsolute', absolute as EventListener);
  window.addEventListener('deviceorientation', ios);
  return () => {
    window.removeEventListener('deviceorientationabsolute', absolute as EventListener);
    window.removeEventListener('deviceorientation', ios);
  };
}

/** Safari asks before sharing motion data, and only from a tap. True when nothing needs asking. */
export const compassNeedsPermission = (): boolean =>
  !(atLeast('8.0') && wa.DeviceOrientation) && typeof (window as any).DeviceOrientationEvent?.requestPermission === 'function';

export async function askCompassPermission(): Promise<boolean> {
  try {
    return (await (window as any).DeviceOrientationEvent.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
