// The phone app signs in through the bot (worker/src/app.ts): it asks the server for a code, opens
// the bot with "/start login_<code>", and waits until the bot has tied the code to the person who
// pressed Start. The session token it gets is kept on this phone only.
import { create } from 'zustand';
import { inBrowser, openLink } from '../tg/telegram';

const TOKEN_KEY = 'lp:app:token';
const POLL_MS = 2000;

export function appToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export type SignInState = 'idle' | 'waiting' | 'expired' | 'failed';

export const useSignIn = create<{ state: SignInState }>()(() => ({ state: 'idle' }));

let attempt = 0;

/** Opens the bot to sign in and waits for it. On success the app reloads, signed in. */
export async function signIn(): Promise<void> {
  const mine = ++attempt;
  useSignIn.setState({ state: 'waiting' });
  // A browser opens a new tab only straight from the tap, so it is opened now and pointed at the bot later.
  const tab = inBrowser ? window.open('', '_blank') : null;
  try {
    const res = await fetch('/api/app/login', { method: 'POST' });
    const start = (await res.json()) as { code: string; bot: string | null; expiresAt: number };
    if (!res.ok || !start.code || !start.bot) throw new Error('no code');
    const link = `https://t.me/${start.bot}?start=login_${start.code}`;
    if (tab) tab.location.href = link;
    else openLink(link);
    while (mine === attempt && Date.now() < start.expiresAt) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (document.hidden) continue; // Telegram is in front: ask again when the app is back
      const poll = await fetch(`/api/app/login?code=${encodeURIComponent(start.code)}`).then((r) => r.json()).catch(() => null);
      if (!poll || poll.status === 'waiting') continue;
      if (poll.status === 'ok' && typeof poll.token === 'string') {
        localStorage.setItem(TOKEN_KEY, poll.token);
        // Start again signed in: the server's answer, the shared data and everything that hangs on them.
        window.location.reload();
        return;
      }
      break;
    }
    if (mine === attempt) useSignIn.setState({ state: 'expired' });
  } catch {
    tab?.close();
    if (mine === attempt) useSignIn.setState({ state: 'failed' });
  }
}

export function cancelSignIn(): void {
  attempt++;
  useSignIn.setState({ state: 'idle' });
}

/** Signs out on this phone. The data on the phone stays; it is no longer shared. */
export async function signOut(): Promise<void> {
  const token = appToken();
  if (token) await fetch('/api/app/logout', { method: 'POST', headers: { Authorization: `app ${token}` } }).catch(() => undefined);
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing saved
  }
  const { clearShared } = await import('../store/sync');
  clearShared();
  window.location.reload();
}

/** The server no longer knows this session: forget it quietly. */
export function dropToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing saved
  }
}
