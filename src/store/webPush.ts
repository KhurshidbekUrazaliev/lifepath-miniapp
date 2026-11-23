// Notifications in a browser or a home-screen app (iPhone: Safari 16.4+, from the home screen only;
// Chrome, Edge and Firefox anywhere). The bot's reminders reach this device too: the browser gives a
// subscription, the server keeps it (PUT /api/push), and its cron sends each reminder there as well
// (worker/src/push.ts). public/sw.js shows them. Not used in Telegram or in the Android app, which
// have their own.
import { create } from 'zustand';
import { api } from './server';
import { inTelegram, isNative, onHomeScreen, onIOS } from '../tg/telegram';

/**
 * unsupported: this browser cannot; home: an iPhone that can once LifePath is on the home screen;
 * off / on: whether this device gets them; denied: the browser blocks LifePath's notifications.
 */
export type PushState = 'unsupported' | 'home' | 'off' | 'on' | 'denied';

const capable = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

function initial(): PushState {
  if (inTelegram || isNative) return 'unsupported';
  // Safari on an iPhone offers push only to a site opened from the home screen.
  if (onIOS && !onHomeScreen) return 'home';
  if (!capable()) return 'unsupported';
  return Notification.permission === 'denied' ? 'denied' : 'off';
}

export const usePush = create<{ state: PushState; busy: boolean }>(() => ({ state: initial(), busy: false }));

const keyBytes = (b64: string): Uint8Array => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

/** Looks whether this device is already subscribed (once at start, when the server answers). */
export async function refreshPush(): Promise<void> {
  const state = usePush.getState().state;
  if (state !== 'off' && state !== 'on') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub && Notification.permission === 'granted') {
      // Sent again each time, so the server has it even after it was moved or forgotten.
      await api('PUT', '/push', sub.toJSON());
      usePush.setState({ state: 'on' });
    }
  } catch {
    // stays as it was
  }
}

/** Turns notifications on for this device. Must run from a tap: browsers ask only then. */
export async function enablePush(): Promise<'ok' | 'denied' | 'failed'> {
  usePush.setState({ busy: true });
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      usePush.setState({ state: permission === 'denied' ? 'denied' : 'off' });
      return 'denied';
    }
    const { key } = await api<{ key: string | null }>('GET', '/push/key');
    if (!key) return 'failed';
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with another key cannot be used: start again.
    const old = sub?.options.applicationServerKey;
    if (sub && old && btoa(String.fromCharCode(...new Uint8Array(old))) !== btoa(String.fromCharCode(...keyBytes(key)))) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) as BufferSource });
    await api('PUT', '/push', sub.toJSON());
    usePush.setState({ state: 'on' });
    return 'ok';
  } catch {
    return 'failed';
  } finally {
    usePush.setState({ busy: false });
  }
}

/** Turns them off for this device (and on signing out). */
export async function disablePush(): Promise<void> {
  usePush.setState({ busy: true });
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await api('DELETE', '/push', { endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
    }
  } catch {
    // nothing to undo
  } finally {
    usePush.setState({ state: usePush.getState().state === 'on' ? 'off' : usePush.getState().state, busy: false });
  }
}
