// Thin, typed wrapper around Telegram.WebApp. Everything degrades to a no-op in a normal browser,
// so the app can be developed and previewed outside Telegram.

declare global {
  interface Window {
    Telegram?: { WebApp: any };
  }
}

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
export const platform: string = inTelegram ? String(wa.platform ?? 'unknown') : 'browser';
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
  openLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
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
