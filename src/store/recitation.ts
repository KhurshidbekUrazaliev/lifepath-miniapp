// Plays recitations: one ayah file after another through a single audio element (iOS lets an element
// that a tap started keep playing new files; a fresh element would need another tap).
import { create } from 'zustand';
import { ayahAudioUrl, reciterOf } from '../content/reciters';

export type RecitationStatus = 'loading' | 'playing' | 'paused' | 'error';

interface Recitation {
  id: string | null; // what is playing: a passage key, or "sample:<reciter>"
  part: number; // which ayah of it
  status: RecitationStatus | null;
}

export const useRecitation = create<Recitation>()(() => ({ id: null, part: 0, status: null }));

let audio: HTMLAudioElement | null = null;
let queue: string[] = [];
let errorTimer: ReturnType<typeof setTimeout> | undefined;

function element(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = 'auto';
  a.addEventListener('playing', () => {
    if (useRecitation.getState().id) useRecitation.setState({ status: 'playing' });
  });
  a.addEventListener('waiting', () => {
    if (useRecitation.getState().status === 'playing') useRecitation.setState({ status: 'loading' });
  });
  a.addEventListener('ended', () => {
    const { id, part } = useRecitation.getState();
    if (!id) return;
    if (part + 1 < queue.length) start(part + 1);
    else stopRecitation();
  });
  a.addEventListener('error', () => {
    if (useRecitation.getState().id) fail();
  });
  audio = a;
  return a;
}

function start(part: number) {
  const a = element();
  useRecitation.setState({ part, status: 'loading' });
  a.src = queue[part];
  a.play().catch((err: unknown) => {
    // AbortError: another file or a stop came first. Anything else (offline, blocked) is a failure.
    if ((err as { name?: string })?.name !== 'AbortError' && useRecitation.getState().id) fail();
  });
}

function fail() {
  queue = [];
  audio?.pause();
  useRecitation.setState({ status: 'error' });
  clearTimeout(errorTimer);
  errorTimer = setTimeout(() => {
    if (useRecitation.getState().status === 'error') useRecitation.setState({ id: null, part: 0, status: null });
  }, 4000);
}

/** Starts `keys` ("2:255", …) from the first ayah with the chosen reciter. */
export function playRecitation(id: string, keys: string[], reciter?: string) {
  if (!keys.length) return;
  clearTimeout(errorTimer);
  const r = reciterOf(reciter);
  queue = keys.map((k) => ayahAudioUrl(r, k));
  useRecitation.setState({ id, part: 0, status: 'loading' });
  start(0);
}

export function stopRecitation() {
  queue = [];
  clearTimeout(errorTimer);
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  useRecitation.setState({ id: null, part: 0, status: null });
}

/** The play button: start, pause, resume, or try again after a failure. */
export function toggleRecitation(id: string, keys: string[], reciter?: string) {
  const s = useRecitation.getState();
  if (s.id !== id || s.status === 'error' || !audio) return playRecitation(id, keys, reciter);
  if (s.status === 'paused') {
    useRecitation.setState({ status: 'loading' });
    audio.play().catch(() => fail());
    return;
  }
  audio.pause();
  useRecitation.setState({ status: 'paused' });
}
