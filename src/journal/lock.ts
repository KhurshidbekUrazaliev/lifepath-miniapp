// The journal's lock: a face or fingerprint check before the journal opens, on this phone only.
// It is a setting of the phone, not of the account: another device may have no way to check at all.
import { create } from 'zustand';
import { allowBiometrics, biometrics, checkBiometrics, onTelegramEvent, tgUser } from '../tg/telegram';

const KEY = `lp:${tgUser.id}:journal-lock`;

function saved(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function save(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // the lock then lasts until the app is closed
  }
}

interface Lock {
  /** The lock is switched on for this phone. */
  on: boolean;
  /** The check was passed since the app was last put away. */
  passed: boolean;
  /** Switches the lock on: the phone has to be able to check, the user has to allow it and pass it once. */
  turnOn: (reason: string) => Promise<'ok' | 'unavailable' | 'refused'>;
  /** Switches it off, which takes passing the check (or anyone holding the phone could). */
  turnOff: (reason: string) => Promise<boolean>;
  unlock: (reason: string) => Promise<boolean>;
  relock: () => void;
}

export const useLock = create<Lock>()((set, get) => ({
  on: saved(),
  passed: false,

  turnOn: async (reason) => {
    const phone = await biometrics();
    if (!phone.available) return 'unavailable';
    if (!phone.granted && !(await allowBiometrics(reason))) return 'refused';
    if (!(await checkBiometrics(reason))) return 'refused';
    save(true);
    set({ on: true, passed: true });
    return 'ok';
  },

  turnOff: async (reason) => {
    if (!get().on) return true;
    const phone = await biometrics();
    // A phone that can no longer check cannot hold the lock either.
    if (phone.available && !(await checkBiometrics(reason))) return false;
    save(false);
    set({ on: false, passed: false });
    return true;
  },

  unlock: async (reason) => {
    const phone = await biometrics();
    if (!phone.available) {
      // Nothing on this phone can do the check any more (it was switched off in the phone's settings,
      // or this is another Telegram). Keeping the journal shut for good would help nobody.
      set({ passed: true });
      return true;
    }
    const ok = await checkBiometrics(reason);
    if (ok) set({ passed: true });
    return ok;
  },

  relock: () => {
    if (get().passed) set({ passed: false });
  },
}));

/** True while the journal must stay shut. */
export const useLocked = (): boolean => useLock((s) => s.on && !s.passed);

// Putting the app away shuts the journal again.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) useLock.getState().relock();
  });
  onTelegramEvent('deactivated', () => useLock.getState().relock());
}
